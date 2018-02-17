import { __nonNull, assert } from "./util/Core"

export function addr (o: Object): Addr {
   return __nonNull(o.__addr)
}

// Require explicit callee (obtaining via IArguments not permitted in strict mode).
export function key (callee: Function, args: IArguments): Addr {
   return addr(callee) + "(" + Array.from(args).map(o => addr(__nonNull(o))).join(",") + ")"
}

// Rather than using a fresh address, we require top-level functions to have globally unique names.
// TODO: store these in the instances map.
export function __def <T> (f: (...xs: Object[]) => T): void {
   assert(f.name !== undefined, "Memo-functions must be named.")
   f.__addr = f.name
}