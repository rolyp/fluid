import { Annotation, ann } from "./util/Annotated2"
import { Class, __nonNull, absurd, assert, className, error } from "./util/Core"
import { Pair } from "./BaseTypes2"
import { DataValue } from "./DataValue2"
import { DataType, ctrToDataType, elimSuffix } from "./DataType2"
import { Env, emptyEnv } from "./Env2"
import { Expr } from "./Expr2"
import { Str, Value, _, make } from "./Value2"
import { Versioned, asVersioned, setα } from "./Versioned2"

import Kont = Expr.Kont
import Trie = Expr.Trie

export function evalTrie<K extends Kont<K>> (σ: Trie<K>): Func<K> {
   if (Trie.Var.is(σ)) {
      return varFunc(σ.x, σ.κ)
   } else
   if (Trie.Constr.is(σ)) {
      const cases: Pair<Str, Expr.Args<K>>[] = σ.cases.toArray(),
            c̅: string[] = cases.map(({ fst: c }) => c.val),
            d: DataType = __nonNull(ctrToDataType.get(c̅[0])),
            c̅ʹ: string[] = [...d.ctrs.keys()], // also sorted
            f̅: Args.ArgsFunc<K>[] = []
      let n: number = 0
      for (let nʹ: number = 0; nʹ < c̅ʹ.length; ++nʹ) {
         if (c̅.includes(c̅ʹ[nʹ])) {
            f̅.push(evalArgs(cases[n++].snd))
         } else {
            f̅.push(undefined as any)
         }
      }
      assert(n === cases.length)
      return make(d.elimC as Class<DataFunc<K>>, ...f̅)
   } else {
      return absurd()
   }
}

// Parser ensures constructor calls are saturated.
function evalArgs<K extends Kont<K>> (Π: Expr.Args<K>): Args.ArgsFunc<K> {
   if (Expr.Args.End.is(Π)) {
      return Args.endFunc(Π.κ)
   } else
   if (Expr.Args.Next.is(Π)) {
      return Args.nextFunc(evalTrie(Π.σ))
   } else {
      return absurd()
   }
}

// Func to distinguish from expression-level Fun. See GitHub issue #128.
export abstract class Func<K extends Kont<K>> extends Value<"Func"> {
   abstract __apply (v: Versioned<Value>): [Env, Match, K]
}

function datatype (f: DataFunc<any>): string {
   const c: string = className(f)
   return c.substr(0, c.length - elimSuffix.length)
}

// Concrete instances have a field per constructor, in *lexicographical* order.
export abstract class DataFunc<K extends Kont<K>> extends Func<K> {
   __apply (v: Versioned<Value>): [Env, Match, K] {
      const c: string = className(v)
      if (v instanceof DataValue) {
         const d: DataType = __nonNull(ctrToDataType.get(c)),
               args_f: Args.ArgsFunc<K> = ((this as any)[c] as Args.ArgsFunc<K>)
         assert(args_f !== undefined, `Pattern mismatch: found ${c}, expected ${datatype(this)}.`)
         const v̅: Versioned<Value>[] = (v as DataValue).fieldValues().map(v => asVersioned(v)),
               [ρ, Ψ, κ] = args_f.__apply(v̅)
         return [ρ, make(d.matchC̅.get(c)!, v, Ψ), κ]
      } else {
         return error(`Pattern mismatch: ${c} is not a datatype.`, v, this)
      }
   }
}

class VarFunc<K extends Kont<K>> extends Func<K> {
   x: Str = _
   κ: K = _

   __apply (v: Versioned<Value>): [Env, Match, K] {
      return [Env.singleton(this.x, v), varMatch(), this.κ]
   }
}

function varFunc<K extends Kont<K>> (x: Str, κ: K): VarFunc<K> {
   return make(VarFunc, x, κ) as VarFunc<K>
}

export abstract class Match extends Value<"Match"> {
   abstract __fwd (): Annotation
   abstract __bwd (α: Annotation): void
}

// Concrete instances have an additional "matched args" field for the matched constructor.
export class DataMatch extends Match {
   v: Versioned<DataValue> = _

   __fwd (): Annotation {
      const Ψ: Args.ArgsMatch = (this as any)[className(this.v)] as Args.ArgsMatch
      return ann.meet(this.v.__α, Ψ.__fwd())
   }

   __bwd (α: Annotation): void {
      const Ψ: Args.ArgsMatch = __nonNull((this as any)[className(this.v)] as Args.ArgsMatch)
      Ψ.__bwd(α)
      setα(α, this.v)
   }
}

class VarMatch extends Match {
   __fwd (): Annotation {
      return ann.top
   }

   __bwd (α: Annotation): void {
      // nothing to do
   }
}

function varMatch<K extends Kont<K>> (): VarMatch {
   return make(VarMatch)
}

export namespace Args {
   export abstract class ArgsFunc<K extends Kont<K>> extends Value<"ArgsFunc"> {
      abstract __apply (v̅: Versioned<Value>[]): [Env, ArgsMatch, K]
   }
   
   class EndFunc<K extends Kont<K>> extends ArgsFunc<K> {
      κ: K = _
      
      __apply (v̅: Versioned<Value>[]): [Env, ArgsMatch, K] {
         if (v̅.length === 0) {
            return [emptyEnv(), endMatch(), this.κ]
         } else {
            return absurd("Too many arguments to constructor.")
         }
      }
   }
   
   export function endFunc<K extends Kont<K>> (κ: K): EndFunc<K> {
      return make(EndFunc, κ) as EndFunc<K>
   }
   
   class NextFunc<K extends Kont<K>> extends ArgsFunc<K> {
      Π: Func<Expr.Args.Args<K>> = _
   
      __apply (v̅: Versioned<Value>[]): [Env, ArgsMatch, K] {
         if (v̅.length === 0) {
            return absurd("Too few arguments to constructor.")
         } else {
            const [v, ...v̅ʹ] = v̅,
                  [ρ, ξ, Πʹ] = this.Π.__apply(v),
                  [ρʹ, Ψ, κ] = evalArgs(Πʹ).__apply(v̅ʹ)
            return [ρ.concat(ρʹ), nextMatch(ξ, Ψ), κ]
         }
      }
   }
   
   export function nextFunc<K extends Kont<K>> (Π: Func<Expr.Args.Args<K>>): NextFunc<K> {
      return make(NextFunc, Π) as NextFunc<K>
   }
   
   export abstract class ArgsMatch extends Value<"ArgsMatch"> {
      abstract __fwd (): Annotation
      abstract __bwd (α: Annotation): void
   }

   class EndMatch extends ArgsMatch {
      __fwd (): Annotation {
         return ann.top
      }

      __bwd (α: Annotation): void {
         // nothing to do
      }
   }
   
   function endMatch (): EndMatch {
      return make(EndMatch)
   }
   
   class NextMatch extends ArgsMatch {
      ξ: Match = _
      Ψ: ArgsMatch = _

      __fwd (): Annotation {
         return ann.meet(this.ξ.__fwd(), this.Ψ.__fwd())
      }

      __bwd (α: Annotation): void {
         if (this.Ψ instanceof NextMatch) {
            this.Ψ.Ψ.__bwd(α)
            this.ξ.__bwd(α)
         } else
         if (this.Ψ instanceof EndMatch) {
            this.ξ.__bwd(α)
         }
      }
   }
   
   function nextMatch (ξ: Match, Ψ: ArgsMatch): NextMatch {
      return make(NextMatch, ξ, Ψ)
   }
}
