import { absurd } from "./util/Core"
import { Annotation, ann } from "./Annotated"
import { Cons, List, Nil, Pair } from "./BaseTypes"
import { Env } from "./Env"
import { ExplVal, Value } from "./ExplVal"
import { Expr } from "./Expr"

import Args = Expr.Args
import Kont = Expr.Kont
import Match = ExplVal.Match
import ExplValMatch = ExplVal.ExplValMatch
import Trie = Expr.Trie
import mapTrie = Expr.Trie.mapTrie

export function lookup<K extends Kont<K>> (tv: ExplVal, σ: Trie<K>): [Env, K, Annotation] {
   const v: Value = tv.v
   if (Trie.Var.is(σ)) {
      return [Env.singleton(σ.x.str, tv), σ.κ, ann.top]
   } else
   if (v instanceof Value.Constr && Trie.Constr.is(σ)) {
      let result: [Env, K, Annotation] | null = null
      σ.cases.map(({ fst: ctr, snd: Π }): null => {
         if (v.ctr.str === ctr) {
            const [ρ, κ, α]: [Env, K, Annotation] = lookupArgs(v.args, Π)
            result = [ρ, κ, ann.meet(α, v.α)]
         }
         return null
      })
      if (result === null) {
         return absurd("Pattern mismatch.", v, σ)
      } else {
         return result
      }
   } else {
      return absurd("Pattern mismatch.", v, σ)
   }
}

export function unlookup<K extends Kont<K>> (ρ: Env, κ: K, α: Annotation): [ExplVal, Trie<K>] {
   throw new Error("Not yet implemented")
}

function lookupArgs<K extends Kont<K>> (tvs: List<ExplVal>, Π: Args<K>): [Env, K, Annotation] {
   // Parser ensures constructor patterns agree with constructor signatures.
   if (Cons.is(tvs) && Args.Next.is(Π)) {
      // codomain of ξ is Args; promote to Args | Match.Args:
      const [ρ, Πʹ, α]: [Env, Args<K>, Annotation] = lookup(tvs.head, Π.σ), 
            [ρʹ, κ, αʹ]: [Env, K, Annotation] = lookupArgs(tvs.tail, Πʹ)
      return [Env.concat(ρ, ρʹ), κ, ann.meet(α, αʹ)]
   } else
   if (Nil.is(tvs) && Args.End.is(Π)) {
      return [Env.empty(), Π.κ, ann.top]
   } else {
      return absurd()
   }
}

// The match for any evaluation with demand σ which yielded value v.
export function match<K extends Kont<K>> (tv: ExplVal, σ: Trie<K>): Match<K> {
   const v: Value = tv.v
   if (Trie.Var.is(σ)) {
      return Match.Var.make(σ.x, v, σ.κ) 
   } else
   if (v instanceof Value.Constr && Trie.Constr.is(σ)) {
      return Match.Constr.make(σ.cases.map(({ fst: ctr, snd: Π }): Pair<string, Args<K> | Match.Args<K>> => {
         if (v.ctr.str === ctr) {
            return Pair.make(ctr, matchArgs(v.args, Π))
         } else {
            return Pair.make(ctr, Π)
         }
      }))
   } else {
      return absurd("Demand mismatch.", v, σ)
   }
}

function matchArgs<K extends Kont<K>> (tvs: List<ExplVal>, Π: Args<K>): Match.Args<K> {
   // Parser ensures constructor patterns agree with constructor signatures.
   if (Cons.is(tvs) && Args.Next.is(Π)) {
      // codomain of ξ is Args; promote to Args | Match.Args:
      const ξ: Match<Args<K>> = match(tvs.head, Π.σ), 
            inj = (Π: Args<K>): Args<K> | Match.Args<K> => Π, 
            ξʹ = mapMatch(Π => matchArgs(tvs.tail, Π), inj, ξ)
      return Match.Args.Next.make(ExplValMatch.make(tvs.head.t, ξʹ))
   } else
   if (Nil.is(tvs) && Args.End.is(Π)) {
      return Match.Args.End.make(Π.κ)
   } else {
      return absurd()
   }
}

function mapMatch<K extends Kont<K>, Kʹ extends Kont<Kʹ>> (f: (κ: K) => Kʹ, g: (κ: K) => Kʹ, ξ: Match<K>): Match<Kʹ> {
   if (Match.Fun.is(ξ)) {
      return Match.Fun.make(ξ.f, f(ξ.κ))
   } else
   if (Match.Var.is(ξ)) {
      return Match.Var.make(ξ.x, ξ.v, f(ξ.κ))
   } else 
   if (Match.Constr.is(ξ)) {
      return Match.Constr.make(ξ.cases.map(({ fst: ctr, snd: Π_or_Ψ }): Pair<string, Args<Kʹ> | Match.Args<Kʹ>> => {
         if (Π_or_Ψ instanceof Match.Args.Args) {
            return Pair.make(ctr, mapMatchArgs(f, g, Π_or_Ψ))
         } else
         if (Π_or_Ψ instanceof Args.Args) {
            return Pair.make(ctr, mapArgs(g)(Π_or_Ψ))
         } else {
            return absurd()
         }
      }))
   } else {
      return absurd()
   }
}

function mapArgs<K extends Kont<K>, Kʹ extends Kont<Kʹ>> (f: (κ: K) => Kʹ): (Π: Args<K>) => Args<Kʹ> {
   return (Π: Args<K>): Args<Kʹ> => {
      if (Args.End.is(Π)) {
         return Args.End.make(f(Π.κ))
      } else
      if (Args.Next.is(Π)) {
         return Args.Next.make(mapTrie(mapArgs(f))(Π.σ))
      } else {
         return absurd()
      }
   }
}

function mapMatchArgs<K extends Kont<K>, Kʹ extends Kont<Kʹ>> (f: (κ: K) => Kʹ, g: (κ: K) => Kʹ, Ψ: Match.Args<K>): Match.Args<Kʹ> {
   if (Match.Args.End.is(Ψ)) {
      return Match.Args.End.make(f(Ψ.κ))
   } else
   if (Match.Args.Next.is(Ψ)) {
      return Match.Args.Next.make(
         ExplValMatch.make(Ψ.tξ.t,
         mapMatch((Ψ: Match.Args<K>) => mapMatchArgs(f, g, Ψ), (Ψ: Match.Args<K>) => mapMatchArgs(g, g, Ψ), Ψ.tξ.ξ)) // "bivariance"
      )
   } else {
      return absurd()
   }
}
