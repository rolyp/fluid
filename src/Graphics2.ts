import { List, Option, Pair } from "./BaseTypes"
import { initDataType } from "./DataType"
import { DataValue } from "./DataValue"
import { Num, Str, _ } from "./Value"

export type GraphicsElementTag = "Polyline" | "Rect" | "Text" | "Group"

export class GraphicsElement<Tag extends GraphicsElementTag = GraphicsElementTag> extends DataValue<Tag> {
}

export class Group extends GraphicsElement<"Group"> {
   x: Num = _
   y: Num = _
   width: Num = _
   height: Num = _
   scale: Transform = _
   translate: Transform = _ // scaling applies to translated coordinates
   gs: List<GraphicsElement> = _
}

export class Rect extends GraphicsElement<"Rect"> {
   x: Num = _
   y: Num = _
   width: Num = _
   height: Num = _
   fill: Str = _
}

export class Polyline extends GraphicsElement<"Polyline"> {
   points: List<Pair<Num, Num>> = _
   stroke: Str = _
   strokeWidth: Num = _
   marker: Option<Marker> = _
}

export class Text extends GraphicsElement<"Text"> {
   x: Num = _
   y: Num = _
   str: Str = _
}

export type TransformTag = "Scale" | "Translate"

export class Transform<Tag extends TransformTag = TransformTag> extends DataValue<Tag> {
}

export class Scale extends Transform<"Scale"> {
   x: Num = _
   y: Num = _
}

export class Translate extends Transform<"Translate"> {
   x: Num = _
   y: Num = _
}

export type MarkerTag = "Arrowhead" | "Circle" | "LeftTick" | "RightTick"

export class Marker<Tag extends MarkerTag = MarkerTag> extends DataValue<Tag> {
}

export class Arrowhead extends Marker<"Arrowhead"> {   
}

export class LeftTick extends Marker<"LeftTick"> {
}

export class RightTick extends Marker<"RightTick"> {
}

export class Circle extends Marker<"Circle"> {   
}

initDataType(GraphicsElement, [Group, Polyline, Rect, Text])
initDataType(Transform, [Scale, Translate])
initDataType(Marker, [Arrowhead, Circle, LeftTick, RightTick])
