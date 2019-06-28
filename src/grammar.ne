@preprocessor typescript

@{%
const moo = require('moo')
const lexer = moo.compile({
   ident: {
      match: /[a-zA-Z_][0-9a-zA-Z_]*'*/, // greedy
      type: moo.keywords({
        keyword: ["as", "match", "fun", "in", "let", "letrec", "primitive", "typematch"],
      })
   },
   whitespace: {
      match: /[ \f\t\r\n]+/,
      lineBreaks: true
   },
   singleLineComment: /\/\/.*$/,
   // WIP: JSON grammar for numbers, https://tools.ietf.org/html/rfc7159.html#section-6.
   number: /0|[1-9][0-9]*/,
   string: /"(?:\\["\\]|[^\n"\\])*"/,
   // not quite sure why I can't use literals here:
   sumOp: /\-|\+\+|\+/,
   productOp: /\*|\//,
   exponentOp: /\*\*/,
   compareOp: /===|==|<==|<=|<|>==|>=|>/,
   symbol: ["(", ")", "=", "→", ";", "{", "}", ",", "[", "]", "..."], // needs to come after compareOp
})
%}

@lexer lexer

@{%
import { assert, error } from "./util/Core"
import { Cons, List, Nil, Pair, nil } from "./BaseTypes"
import { arity, types } from "./DataType"
import { Expr } from "./Expr"
import { singleton } from "./FiniteMap"
import { Str } from "./Value"
import { ν, num, str } from "./Versioned"

// Constructors must start with an uppercase letter, a la Haskell. Will fix this as part of issue #49.
function isCtr (str: string): boolean {
   const ch: string = str.charAt(0)
   return ch === ch.toUpperCase() && ch !== ch.toLowerCase()
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
   fun {% id %}

defs1 ->
   defList keyword["in"] expr {% ([defs, , e]) => Expr.defs(ν(), defs, e) %}

compareExpr ->
   compareExpr compareOp sumExpr {% ([e1, op, e2]) => Expr.binaryApp(ν(), e1, str(ν(), op), e2) %} | 
   sumExpr {% id %}
sumExpr -> 
   sumExpr sumOp productExpr {% ([e1, op, e2]) => Expr.binaryApp(ν(), e1, str(ν(), op), e2) %} | 
   productExpr {% id %}
productExpr -> 
   productExpr productOp exponentExpr {% ([e1, op, e2]) => Expr.binaryApp(ν(), e1, str(ν(), op), e2) %} |
   exponentExpr {% id %}
exponentExpr -> 
   exponentExpr exponentOp appChain {% ([e1, op, e2]) => Expr.binaryApp(ν(), e1, str(ν(), op), e2) %} |
   appChain {% id %}

appChain -> 
   simpleExpr {% id %} |
   appChain simpleExpr {% ([e1, e2]) => Expr.app(ν(), e1, e2) %}

simpleExpr ->
   variable {% id %} |
   string {% id %} |
   number {% id %} |
   parenthExpr {% id %} |
   pair {% id %} |
   list {% id %} |
   constr {% id %} |
   matchAs {% id %} |
   typematch {% id %}

variable -> 
   var 
   {% ([x]) => Expr.var_(ν(), x) %}

var ->
   lexeme[%ident] 
   {% ([[x]], _, reject) => {
      if (isCtr(x.value)) {
         return reject
      }
      return str(ν(), x.value) 
   } %}

string -> 
   lexeme[%string] 
   {% ([lit]) => Expr.constStr(ν(), str(ν(), lit as string)) %}

number ->
   lexeme[%number] 
   {% ([lit]) => Expr.constNum(ν(), num(ν(), new Number(lit as string).valueOf())) %}

parenthExpr -> 
   lexeme["("] expr lexeme[")"] 
   {% ([, e,]) => e %}

pair -> 
   lexeme["("] expr lexeme[","] expr lexeme[")"]
   {% ([, e1, , e2,]) => Expr.constr(ν(), str(ν(), Pair.name), List.fromArray([e1, e2])) %}

list -> 
   lexeme["["] listOpt lexeme["]"] # ouch: "
   {% ([, e, ]) => e %}

# inconsistency with constructor signatures must now be an unsuccessful parse, rather than an
# error per se.
constr ->
   ctr args
   {% ([c, e̅], _, reject) => {
      assert(c instanceof Str)
      if (arity(c) !== e̅.length) {
         return reject
      }
      return Expr.constr(ν(), c, List.fromArray(e̅))
   } %}

ctr ->
   lexeme[%ident] 
   {% ([[x]], _, reject) => {
      if (!isCtr(x.value)) {
         return reject
      }
      return str(ν(), x.value)
   } %}

args ->
   null 
   {% () => [] %} |
   lexeme["("] expr (lexeme[","] expr {% ([, e]) => e %}):* lexeme[")"]
   {% ([, e, es,]) => [e, ...es] %}

typematch ->
   keyword["typematch"] expr keyword["as"] typeMatches
   {% ([, e, m]) => Expr.typecase(ν(), e, m) %}

defList -> 
   def (lexeme[";"] def {% ([, def]) => def %}):* 
   {% ([def, defs]) => List.fromArray([def, ...defs]) %}

def -> 
   let {% id %} | letrec {% id %} | prim {% id %}

let -> 
   keyword["let"] var lexeme["="] expr 
   {% ([, x, , e]) => Expr.let_(x, e) %}
letrec -> 
   keyword["letrec"] recDef (lexeme[";"] recDef {% ([, recDef]) => recDef %}):* 
   {% ([, recDef, δ]) => Expr.letRec(List.fromArray([recDef, ...δ])) %}
prim -> 
   keyword["primitive"] var
   {% ([, x]) => Expr.prim(x) %}

recDef -> 
   keyword["fun"] var matches
   {% ([, f, σ]) => Expr.recDef(f, σ) %}

fun -> 
   keyword["fun"] matches
   {% ([, σ]) => Expr.fun(ν(), σ) %}
matchAs -> 
   keyword["match"] expr keyword["as"] matches
   {% ([, e, , σ]) => Expr.matchAs(ν(), e, σ) %}

matches ->
   match |
   lexeme["{"] match (lexeme[";"] match):* lexeme["}"]

match -> 
   pattern lexeme["→"] expr |
   pattern matches

typeMatches ->
   typeMatch |
   lexeme["{"] typeMatch (lexeme[";"] typeMatch):* lexeme["}"]

typeMatch -> 
   typename lexeme["→"] expr
   {% ([x, , e]) => {
      assert(x instanceof Str)
      if (!types.has(x.val)) {
         error(`Type name ${x.val} not found.`)
      }
      return singleton(x, e)
   } %}

typename ->
   lexeme[%ident]
   {% ([[x]]) => str(ν(), x.value) %} # deconstruct twice because macro doesn't seem to do it

listOpt -> 
   null 
   {% () => Expr.constr(ν(), str(ν(), Nil.name), nil(ν())) %} |
   expr (lexeme[","] expr {% ([, e]) => e %}):* listRestOpt
   {% ([e, es, eʹ]) => [e, ...es, eʹ].reverse().reduce((e̅, e) => Expr.constr(ν(), str(ν(), Cons.name), List.fromArray([e, e̅]))) %}

listRestOpt ->
   null 
   {% () => Expr.constr(ν(), str(ν(), Nil.name), nil(ν())) %} |
   lexeme[","] lexeme["..."] expr 
   {% ([, , e]) => e %}

pattern ->
   variable_pattern {% id %} |
   pair_pattern {% id %} | 
   list_pattern {% id %} |
   constr_pattern {% id %}

variable_pattern -> 
   var

pair_pattern -> 
   lexeme["("] pattern lexeme[","] pattern lexeme[")"]

list_pattern -> 
   lexeme["["] listOpt_pattern lexeme["]"] # ouch: "

# Don't know how to build tries yet.
constr_pattern ->
   ctr args_pattern
   {% ([c, p̅], _, reject) => {
      assert(c instanceof Str)
      if (arity(c) !== p̅.length) {
         return reject
      }
      return [c, p̅]
   } %}

args_pattern ->
   null 
   {% () => [] %} |
   lexeme["("] pattern (lexeme[","] expr {% ([, p]) => p %}):* lexeme[")"]
   {% ([, p, ps,]) => [p, ...ps] %}

listOpt_pattern -> 
   null | 
   pattern (lexeme[","] pattern):* listRestOpt_pattern

listRestOpt_pattern ->
   null |
   lexeme[","] lexeme["..."] pattern

compareOp -> 
   lexeme[%compareOp] 
   {% ([[x]]) => x.value %}

exponentOp -> 
   lexeme[%exponentOp]
   {% ([[x]]) => x.value %}

productOp -> 
   lexeme[%productOp] 
   {% ([[x]]) => x.value %}

sumOp ->
   lexeme[%sumOp] 
   {% ([[x]]) => x.value %}
