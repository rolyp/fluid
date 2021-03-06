/// <reference path="../node_modules/@types/mocha/index.d.ts" />

import { as } from "../src/util/Core"
import { Cons, Pair } from "../src/BaseTypes"
import { exprClass } from "../src/DataType"
import { Env } from "../src/Env"
import { Expr } from "../src/Expr"
import { VarElim } from "../src/Match"
import { openWithImports } from "../src/Module"
import { Persistent } from "../src/Value"
import { ν, at, num, str } from "../src/Versioned"
import { ExplValueCursor, ExprCursor } from "../src/app/Cursor"
import { Pane } from "../src/app/Pane"
import { Edit } from "./util/Core"

before((done: MochaDone) => {
   Pane.initialise(".")
   done()
})

describe("edit", () => {
   describe("arithmetic", () => {
      it("ok", () => {
         const [ρ, e]: [Env, Expr] = openWithImports("arithmetic")
         new (class extends Edit {
            setup (here: ExprCursor) {
               here.to(Expr.BinaryApp, "e1")
                   .to(Expr.BinaryApp, "e2")
                   .to(Expr.ConstNum, "val")
                   .setNum(6)
            }

            expect (here: ExplValueCursor) {
               here.isChanged({ val: { before: 42, after: 49 } })
                   .toTerminal()
                   .toBinaryArg1("*")
                   .isChanged({ val: { before: 6, after: 7 } })
                   .toTerminal()
                   .toBinaryArg2("+")
                   .isChanged({ val: { before: 5, after: 6 } })
            }
         })(ρ, e)
      })
   })

   describe("filter", () => {
      it("ok", () => {
         const [ρ, e]: [Env, Expr] = openWithImports("filter")
         new (class extends Edit {
            setup (here: ExprCursor) {
               here.to(Expr.App, "f")
                   .to(Expr.App, "e")
                   .to(Expr.Fun, "σ")
                   .to(VarElim, "κ")
                   .to(Expr.BinaryApp, "e1")
                   .to(Expr.ConstNum, "val")
                   .setNum(3)
            }

            expect (here: ExplValueCursor) {
               here.isNew()
                   .to(Cons, "head") // because we had to reconstruct the head
                   .isUnchanged()
               here.to(Cons, "tail")
                   .isNew() // because a new element passed the filter
                   .to(Cons, "tail")
                   .isUnchanged()
                   .to(Cons, "tail")
                   .isUnchanged()
            }
         })(ρ, e)
      })
   })

   describe("foldr_sumSquares", () => {
      it("ok", () => {
         const [ρ, e]: [Env, Expr] = openWithImports("foldr_sumSquares")
         new (class extends Edit {
            setup (here: ExprCursor) {
               here = here
                   .to(Expr.App, "f")
                   .to(Expr.App, "f")
                   .to(Expr.App, "e")
                   .to(Expr.Fun, "σ")
                   .toCase(Pair)
                   .var_("x")
                   .var_("y") // body of clause
               here.to(Expr.BinaryApp, "opName")
                   .setStr("/")
               here.splice(Expr.BinaryApp, ["e1", "e2"], ([e1, e2]: Persistent[]): [Expr, Expr] => {
                  const e1ʹ: Expr = Expr.binaryApp(as(e1, Expr.Expr), str("+")(ν()), as(e2, Expr.Expr))(ν()),
                        e2ʹ: Expr = Expr.constNum(num(2)(ν()))(ν())
                  return [e1ʹ, e2ʹ]
               })
            }

            expect (here: ExplValueCursor) {
               here = here.isNew()
                   .toTerminal()
               here.toBinaryArg2("/").isNew()
               here = here.toBinaryArg1("/").isNew()
                   .toTerminal()
               here.toBinaryArg1("+").isUnchanged()
               here = here.toBinaryArg2("+").isNew()
                   .toTerminal()
               here.toBinaryArg1("*").isNew()
               here.toBinaryArg2("*").isNew()
            }
         })(ρ, e)
      })
   })

   describe("ic2019", () => {
      it("ok", () => {
         const [ρ, e]: [Env, Expr] = openWithImports("ic2019")
         new (class extends Edit {
            setup (here: ExprCursor) {
               here.toDef("f")
                   .to(Expr.RecDef, "σ")
                   .toCase(Cons)
                   .var_("x").var_("xs")
                   .constr_splice(Cons, ["head"], ([e]: Expr[]): [Expr] => {
                      const eʹ: Expr = Expr.app(Expr.var_(str("sq")(ν()))(ν()), Expr.var_(str("x")(ν()))(ν()))(ν())
                      return [at(exprClass(Pair), e, eʹ)(ν())]
                   })
            }

            expect (here: ExplValueCursor) {
               here.to(Cons, "head").isNew().to(Pair, "fst").isUnchanged()
               here.to(Cons, "head").to(Pair, "snd").isNew()
               here = here.to(Cons, "tail")
               here.to(Cons, "head").isNew().to(Pair, "fst").isUnchanged()
               here.to(Cons, "head").to(Pair, "snd").isNew()
            }
         })(ρ, e)
      })
   })
})
