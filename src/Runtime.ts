import { __shallowCopy, __shallowMergeAssign, assert, className, funName, make } from "./util/Core"

export interface Ctr<T> {
   new (): T
}

// Documents any persistent object (interned or versioned) which may be used as a memo key.
export class PersistentObject {
   __PersistentObject (): void {
      // discriminator
   }   
}

export type Persistent = PersistentObject | string | number

// A memo key which is sourced externally to the system. (The name "External" exists in the global namespace.)
export class ExternalObject extends PersistentObject {
   id: number

   static make (id: number): ExternalObject {
      const this_: ExternalObject = make(ExternalObject, id)
      this_.id = id
      return this_
   }
}

// Fresh keys represent inputs to the system.
export const ν: () => ExternalObject =
   (() => {
      let count: number = 0
      return () => {
         return ExternalObject.make(count++)
      }
   })()

export class VersionedObject<K extends PersistentObject = PersistentObject> extends PersistentObject {
   // Initialise these properties at object creation, rather than via constructor hierarchies.
   __history: this[] = undefined as any
   __id: K = undefined as any
   __version: () => Object = undefined as any
}

// Keys must be "memo" objects (interned or persistent).
type InstancesMap = Map<PersistentObject, VersionedObject<PersistentObject>>
const __ctrInstances: Map<Ctr<VersionedObject>, InstancesMap> = new Map

// Allocate a blank object uniquely identified by a memo-key. Needs to be initialised afterwards.
// Unfortunately the Id type constraint is rather weak in TypeScript because of "bivariance".
export function create <K extends PersistentObject, T extends VersionedObject<K>> (α: K, ctr: Ctr<T>): T {
   let instances: InstancesMap | undefined = __ctrInstances.get(ctr)
   if (instances === undefined) {
      instances = new Map
      __ctrInstances.set(ctr, instances)
   }
   let o: VersionedObject<K> | undefined = instances.get(α) as VersionedObject<K>
   if (o === undefined) {
      o = Object.create(ctr.prototype) as T // new ctr doesn't work any more
      // This may massively suck, performance-wise. Define these here rather than on VersionedObject
      // to avoid constructors everywhere.
      Object.defineProperty(o, "__id", {
         value: α,
         enumerable: false
      })
      Object.defineProperty(o, "__history", {
         value: [],
         enumerable: false
      })
      // At a given version (there is only one, currently) enforce "increasing" (LVar) semantics.
      Object.defineProperty(o, "__version", {
         value: function (): Object {
            const this_: VersionedObject<K> = this as VersionedObject<K>
            if (this_.__history.length === 0) {
               this_.__history.push(__shallowCopy(this_))
            } else {
               __shallowMergeAssign(this_.__history[0], this_)
            }
            return this
         },
         enumerable: false
      })
      instances.set(α, o)
   } else {
      // initialisation should always version, which will enforce single-assignment, so this additional
      // check strictly unnecessary. However failing now avoids weird ill-formed objects.
      assert(o.constructor === ctr, "Address collision (different constructor).", α, className(o), funName(ctr))
   }
   return o as T
}
