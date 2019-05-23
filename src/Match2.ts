import { Annotation, ann } from "./util/Annotated2"
import { Class, __nonNull, absurd, assert, className, error } from "./util/Core"
import { Pair } from "./BaseTypes2"
import { DataType, ctrToDataType, elimNameSuffix } from "./DataType2"
import { Env, emptyEnv } from "./Env2"
import { Expr } from "./Expr2"
import { DataValue, Str, Value, _, make } from "./Value2"
import { Versioned, asVersioned, setα } from "./Versioned2"

import Kont = Expr.Kont
import Trie = Expr.Trie

export function evalTrie<K extends Kont<K>> (σ: Trie<K>): Func<K> {
   if (Trie.Var.is(σ)) {
      return varFunc(σ)
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

// TODO: sync up with evalTrie/__apply pattern.
export function unmatch<K extends Kont<K>> (ξ: Match<K>, α: Annotation): void {
   ξ.__unapply(α)
}

// Parser ensures constructor calls are saturated.
function evalArgs<K extends Kont<K>> (Π: Expr.Args<K>): Args.ArgsFunc<K> {
   if (Expr.Args.End.is(Π)) {
      return Args.endFunc(Π)
   } else
   if (Expr.Args.Next.is(Π)) {
      return Args.nextFunc(Π)
   } else {
      return absurd()
   }
}

export class Plug<K extends Kont<K> | Versioned<Value>> extends DataValue<"Plug"> {
   ξ: Match<K> = _
   κ: K = _ // fills the single hole in ξ
}

export function plug<K extends Kont<K> | Versioned<Value>> (ξ: Match<K>, κ: K): Plug<K> {
   return make(Plug, ξ, κ) as Plug<K>
}

// Func to distinguish from expression-level Fun. See GitHub issue #128.
export abstract class Func<K extends Kont<K>> extends Value<"Func"> {
   abstract __apply (v: Versioned<Value>): [Env, Plug<K>, Annotation]
}

function datatype (f: DataFunc<any>): string {
   const c: string = className(f)
   return c.substr(0, c.length - elimNameSuffix.length)
}

// Concrete instances must have a field per constructor, in *lexicographical* order.
export abstract class DataFunc<K extends Kont<K>> extends Func<K> {
   __apply (v: Versioned<Value>): [Env, Plug<K>, Annotation] {
      if (v instanceof DataValue) {
         const args_f: Args.ArgsFunc<K> = ((this as any)[className(v)] as Args.ArgsFunc<K>)
         assert(args_f !== undefined, `Pattern mismatch: found ${className(v)}, expected ${datatype(this)}.`)
         const v̅: Versioned<Value>[] = (v as DataValue).fieldValues().map(v => asVersioned(v)),
               [ρ, {κ}, α] = args_f.__apply(v̅)
         return [ρ, plug(dataMatch(v), κ), ann.meet(v.__α, α)]
      } else {
         return error(`Pattern mismatch: ${className(v)} is not a datatype.`, v, this)
      }
   }
}

class VarFunc<K extends Kont<K>> extends Func<K> {
   σ: Trie.Var<K> = _

   __apply (v: Versioned<Value>): [Env, Plug<K>, Annotation] {
      return [Env.singleton(this.σ.x, v), plug(varMatch(), this.σ.κ), ann.top]
   }
}

function varFunc<K extends Kont<K>> (σ: Trie.Var<K>): VarFunc<K> {
   return make(VarFunc, σ) as VarFunc<K>
}

export abstract class Match<K> extends Value<"Match"> {
   abstract __unapply (α: Annotation): void
}

export class DataMatch<K extends Kont<K>> extends Match<K> {
   v: Versioned<DataValue> = _

   __unapply (α: Annotation): void {
      const Ψ: Args.ArgsMatch<K> = (this as any)[className(this.v)] as Args.ArgsMatch<K>
      Ψ.__unapply(α)
      setα(α, this.v)
   }
}

function dataMatch<K extends Kont<K>> (v: Versioned<DataValue>): DataMatch<K> {
   return make(DataMatch, v)
}

class VarMatch<K extends Kont<K>> extends Match<K> {
   __unapply (α: Annotation): void {
      // nothing to do
   }
}

function varMatch<K extends Kont<K>> (): VarMatch<K> {
   return make(VarMatch)
}

export namespace Args {
   export class Plug<K extends Kont<K>, M extends ArgsMatch<K>> extends DataValue<"Args.Plug"> {
      Ψ: M = _
      κ: K = _ // fills the single hole in Ψ
   }

   export function plug<K extends Kont<K>, M extends ArgsMatch<K>> (ξ: M, κ: K): Plug<K, M> {
      return make(Plug, ξ, κ) as Plug<K, M>
   }

   export abstract class ArgsFunc<K extends Kont<K>> extends Value<"ArgsFunc"> {
      abstract __apply (v̅: Versioned<Value>[]): [Env, Args.Plug<K, ArgsMatch<K>>, Annotation]
   }
   
   class EndFunc<K extends Kont<K>> extends ArgsFunc<K> {
      Π: Expr.Args.End<K> = _
      
      __apply (v̅: Versioned<Value>[]): [Env, Args.Plug<K, EndMatch<K>>, Annotation] {
         if (v̅.length === 0) {
            return [emptyEnv(), Args.plug(endMatch(), this.Π.κ), ann.top]
         } else {
            return absurd("Too many arguments to constructor.")
         }
      }
   }
   
   export function endFunc<K extends Kont<K>> (Π: Expr.Args.End<K>): EndFunc<K> {
      return make(EndFunc, Π) as EndFunc<K>
   }
   
   class NextFunc<K extends Kont<K>> extends ArgsFunc<K> {
      Π: Expr.Args.Next<K> = _
   
      __apply (v̅: Versioned<Value>[]): [Env, Args.Plug<K, NextMatch<K>>, Annotation] {
         if (v̅.length === 0) {
            return absurd("Too few arguments to constructor.")
         } else {
            const [v, ...v̅ʹ] = v̅,
                  [ρ, {κ: Π}, α] = evalTrie(this.Π.σ).__apply(v),
                  [ρʹ, {κ}, αʹ] = evalArgs(Π).__apply(v̅ʹ)
            return [ρ.concat(ρʹ), Args.plug(nextMatch(), κ), ann.meet(α, αʹ)]
         }
      }
   }
   
   export function nextFunc<K extends Kont<K>> (Π: Expr.Args.Next<K>): NextFunc<K> {
      return make(NextFunc, Π) as NextFunc<K>
   }
   
   export abstract class ArgsMatch<K> extends Value<"ArgsMatch"> {
      abstract __unapply (α: Annotation): void
   }

   class EndMatch<K extends Kont<K>> extends ArgsMatch<K> {
      __unapply (α: Annotation): void {
         // nothing to do
      }
   }
   
   function endMatch<K extends Kont<K>> (): EndMatch<K> {
      return make(EndMatch)
   }
   
   class NextMatch<K extends Kont<K>> extends ArgsMatch<K> {
      ξ: Match<K>
      Ψ: ArgsMatch<K>
   
      __unapply (α: Annotation): void {
         if (NextMatch.is(this.Ψ)) {
            this.Ψ.Ψ.__unapply(α)
            this.ξ.__unapply(α)
         }
      }

      static is<K extends Kont<K>> (Ψ: ArgsMatch<K>): Ψ is NextMatch<K> {
         return Ψ instanceof NextMatch
      }
   }
   
   function nextMatch<K extends Kont<K>> (): NextMatch<K> {
      return make(NextMatch)
   }
}
