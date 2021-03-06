@preprocessor typescript

@{%
const moo = require('moo')
const lexer = moo.compile({
   ident: {
      match: /[a-zA-Z_][0-9a-zA-Z_]*'*/, // greedy
      type: moo.keywords({
        keyword: ["_", "as", "match", "fun", "in", "let", "letrec", "primitive", "typematch"],
      })
   },
   whitespace: {
      match: /[ \f\t\r\n]+/,
      lineBreaks: true
   },
   singleLineComment: /\/\/.*$/,
   // JSON grammar for numbers, https://tools.ietf.org/html/rfc7159.html#section-6.
   // Seems Moo requires us to use non-capturing groups (?:)
   number: /\-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[e|E][-|+]?[0-9]+)?/,
   string: /"(?:\\["\\]|[^\n"\\])*"/,
   // not quite sure why I can't use literals here:
   sumOp: /\-|\+\+|\+/,
   exponentOp: /\*\*/,
   productOp: /\*|\//, // must come after exponentOp
   compareOp: /==|<=|<|>=|>/,
   symbol: ["(", ")", "=", "→", ";", "{", "}", ",", "[", "]", "..."], // must come after compareOp
})
%}

@lexer lexer

@{%
import { __check, assert, userError } from "./util/Core"
import { Cons, List, Nil, Pair } from "./BaseTypes"
import { Ctr, ctrFor, exprClass, types } from "./DataType"
import { Expr } from "./Expr"
import { singleton, unionWith } from "./FiniteMap"
import { DataElim, dataElim, varElim } from "./Match"
import { Str } from "./Value"
import { ν, at, num, str } from "./Versioned"

import Cont = Expr.Cont

// Constructors must start with an uppercase letter, a la Haskell. Will fix this as part of issue #49.
function isCtr (str: string): boolean {
   const ch: string = str.charAt(0)
   return ch === ch.toUpperCase() && ch !== ch.toLowerCase()
}

type MkCont = (κ: Cont) => Cont

function compose (mk_κ1: MkCont, mk_κ2: MkCont): MkCont {
   return (κ: Cont) => mk_κ1(mk_κ2(κ))
}
%}

# Allow leading whitespace/comments.
rootExpr -> 
   _ expr {% ([, e]) => e %} |
   expr {% id %}

lexeme[X] ->
   $X {% id %} | 
   $X _ {% ([x, ]) => x %}
   
keyword[X] -> lexeme[$X]

_ -> (%whitespace | %singleLineComment):+

expr -> 
   compareExpr {% id %} |
   defs1 {% id %} |
   fun {% id %} |
   matchAs {% id %} |
   typematch {% id %}

defs1 ->
   defList keyword["in"] expr 
   {% ([defs, , e]) => Expr.defs(defs, e)(ν()) %}

compareExpr ->
   compareExpr compareOp sumExpr 
   {% ([e1, op, e2]) => Expr.binaryApp(e1, str(op)(ν()), e2)(ν()) %} | 
   sumExpr 
   {% id %}

sumExpr -> 
   sumExpr sumOp productExpr 
   {% ([e1, op, e2]) => Expr.binaryApp(e1, str(op)(ν()), e2)(ν()) %} | 
   productExpr 
   {% id %}
   
productExpr -> 
   productExpr productOp exponentExpr 
   {% ([e1, op, e2]) => Expr.binaryApp(e1, str(op)(ν()), e2)(ν()) %} |
   exponentExpr 
   {% id %}

exponentExpr -> 
   exponentExpr exponentOp appChain 
   {% ([e1, op, e2]) => Expr.binaryApp(e1, str(op)(ν()), e2)(ν()) %} |
   appChain 
   {% id %}

appChain -> 
   simpleExpr 
   {% id %} |
   appChain simpleExpr 
   {% ([e1, e2]) => Expr.app(e1, e2)(ν()) %}

simpleExpr ->
   variable {% id %} |
   string {% id %} |
   number {% id %} |
   parenthExpr {% id %} |
   pair {% id %} |
   list {% id %} |
   constr {% id %}

variable -> 
   var 
   {% ([x]) => Expr.var_(x)(ν()) %}

var ->
   lexeme[%ident] 
   {% ([[x]], _, reject) => {
      if (isCtr(x.value)) {
         return reject
      }
      return str(x.value)(ν()) 
   } %}

string -> 
   lexeme[%string] 
   {% ([[lit]]) => Expr.constStr(str((lit.value as string).slice(1, -1))(ν()))(ν()) %}

number ->
   lexeme[%number] 
   {% ([[lit]]) => Expr.constNum(num(new Number(lit.value as string).valueOf())(ν()))(ν()) %}

parenthExpr -> 
   lexeme["("] expr lexeme[")"] 
   {% ([, e,]) => e %}

pair -> 
   lexeme["("] expr lexeme[","] expr lexeme[")"]
   {% ([, e1, , e2,]) => at(exprClass(Pair), e1, e2)(ν()) %}

list -> 
   lexeme["["] listOpt lexeme["]"] # ouch: "
   {% ([, e, ]) => e %}

# inconsistency with constructor signatures must now be an unsuccessful parse, rather than an
# error per se.
constr ->
   ctr args
   {% ([c, e̅], _, reject) => {
      assert(c instanceof Str)
      const ctr: Ctr = ctrFor(c.val)
      if (ctr.arity !== e̅.length) {
         return reject
      }
      return at(exprClass(ctr.C), ...e̅)(ν())
   } %}

ctr ->
   lexeme[%ident] 
   {% ([[x]], _, reject) => {
      if (!isCtr(x.value)) {
         return reject
      }
      return str(x.value)(ν())
   } %}

args ->
   null 
   {% () => [] %} |
   lexeme["("] expr (lexeme[","] expr {% ([, e]) => e %}):* lexeme[")"]
   {% ([, e, es,]) => [e, ...es] %}

typematch ->
   keyword["typematch"] expr keyword["as"] typeMatches
   {% ([, e, , m]) => Expr.typematch(e, m)(ν()) %}

defList -> 
   def (lexeme[";"] def {% ([, def]) => def %}):* 
   {% ([def, defs]) => List.fromArray([def, ...defs]) %}

def -> 
   let {% id %} | letrec {% id %} | prim {% id %}

let -> 
   keyword["let"] var lexeme["="] expr 
   {% ([, x, , e]) => Expr.let_(x, e)(ν()) %}

letrec -> 
   keyword["letrec"] recDef (lexeme[";"] recDef {% ([, recDef]) => recDef %}):* 
   {% ([, recDef, δ]) => Expr.letRec(List.fromArray([recDef, ...δ]))(ν()) %}

prim ->
   keyword["primitive"] var
   {% ([, x]) => Expr.prim(x)(ν()) %}

recDef -> 
   keyword["fun"] var matches
   {% ([, f, σ]) => Expr.recDef(f, σ)(ν()) %}

fun -> 
   keyword["fun"] matches
   {% ([, σ]) => Expr.fun(σ)(ν()) %}

matchAs -> 
   keyword["match"] expr keyword["as"] matches
   {% ([, e, , σ]) => Expr.matchAs(e, σ)(ν()) %}

matches ->
   match {% id %} |
   lexeme["{"] match (lexeme[";"] match {% ([, m]) => m %}):* lexeme["}"]
   {% ([, m, ms,]) => [m, ...ms].reduce(DataElim.join) %}

match ->
   pattern lexeme["→"] expr 
   {% ([mk_κ, , e]) => mk_κ(e) %} |
   pattern matches
   {% ([mk_κ1, σ]) => mk_κ1(Expr.fun(σ)(ν())) %}

typeMatches ->
   typeMatch
   {% id %} |
   lexeme["{"] typeMatch (lexeme[";"] typeMatch {% ([, m]) => m %}):* lexeme["}"]
   {% ([, m, ms,]) => [m, ...ms].reduce((m1, m2) => unionWith(m1, m2, (e: Expr, eʹ: Expr): Expr => userError("Overlapping typecase branches."))) %}

typeMatch -> 
   typename lexeme["→"] expr
   {% ([x, , e]) => {
      assert(x instanceof Str)
      if (!types.has(x.val)) {
         userError(`Type name ${x.val} not found.`)
      }
      return singleton(x, e)
   } %}

typename ->
   lexeme[%ident]
   {% ([[x]]) => str(x.value)(ν()) %}

listOpt -> 
   null 
   {% () => at(exprClass(Nil))(ν()) %} |
   expr (lexeme[","] expr {% ([, e]) => e %}):* listRestOpt
   {% ([e, es, eʹ]) => [e, ...es, eʹ].reverse().reduce((e̅, e) => at(exprClass(Cons), e, e̅)(ν())) %}

listRestOpt ->
   null 
   {% () => at(exprClass(Nil))(ν()) %} |
   lexeme[","] lexeme["..."] expr 
   {% ([, , e]) => e %}

pattern ->
   variable_pattern {% id %} |
   pair_pattern {% id %} | 
   list_pattern {% id %} |
   constr_pattern {% id %}

variable_pattern ->
   keyword["_"]
   {% () => (κ: Cont) => varElim(str("_")(ν()), κ)(ν()) %} |
   var 
   {% ([x]) => (κ: Cont) => varElim(x, κ)(ν()) %}

pair_pattern ->
   lexeme["("] pattern lexeme[","] pattern lexeme[")"]
   {% ([, mk_κ1, , mk_κ2, ,]) => (κ: Cont) => dataElim([Pair.name, compose(mk_κ1, mk_κ2)(κ)])(ν()) %}

list_pattern -> 
   lexeme["["] listOpt_pattern lexeme["]"] # ouch: "
   {% ([, mk_κ, ]) => mk_κ %}

listOpt_pattern -> 
   null
   {% () => (κ: Cont) => dataElim([Nil.name, κ])(ν()) %} | 
   list1_pattern
   {% id %}

list1_pattern ->
   pattern listRestOpt_pattern
   {% ([mk_κ1, mk_κ2]) => (κ: Cont) => dataElim([Cons.name, compose(mk_κ1, mk_κ2)(κ)])(ν()) %}

listRestOpt_pattern ->
   null 
   {% () => (κ: Cont) => dataElim([Nil.name, κ])(ν()) %} |
   lexeme[","] lexeme["..."] pattern
   {% ([, , mk_κ]) => mk_κ %} |
   lexeme[","] list1_pattern
   {% ([, mk_κ]) => mk_κ %}

constr_pattern ->
   ctr args_pattern
   {% ([c, mk_κs], _, reject) => {
      assert(c instanceof Str)
      if (ctrFor(c.val).arity !== mk_κs.length) {
         return reject
      }
      return (κ: Cont) => dataElim([c.val, mk_κs.reduce(compose, (κ: Cont) => κ)(κ)])(ν())
   } %}

args_pattern ->
   null 
   {% () => [] %} |
   lexeme["("] pattern (lexeme[","] pattern {% ([, mk_κ]) => mk_κ %}):* lexeme[")"]
   {% ([, mk_κ, mk_κs,]) => [mk_κ, ...mk_κs] %}

compareOp -> lexeme[%compareOp] {% ([[x]]) => x.value %}
exponentOp -> lexeme[%exponentOp] {% ([[x]]) => x.value %}
productOp -> lexeme[%productOp] {% ([[x]]) => x.value %}
sumOp -> lexeme[%sumOp] {% ([[x]]) => x.value %}
