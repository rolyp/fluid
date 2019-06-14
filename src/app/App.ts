import { ann } from "../util/Annotated"
import { __nonNull, as } from "../util/Core"
import { emptyEnv } from "../Env"
import { Direction, Eval } from "../Eval"
import { ExplValue } from "../ExplValue"
import { Expr } from "../Expr"
import { GraphicsElement } from "../Graphics"
import { Value } from "../Value"
import { ν, setallα, str } from "../Versioned"
import { importDefaults, load, parse } from "../../test/util/Core"
import { Cursor } from "../../test/util/Cursor"
import { GraphicsRenderer, Slicer, svgNS } from "./GraphicsRenderer"

class View implements Slicer {
   e: Expr
   tv: ExplValue
   view: GraphicsRenderer
   direction: Direction

   constructor (e: Expr, svg: SVGSVGElement) {
      this.e = e
      this.tv = Eval.eval_(emptyEnv(), e)
      this.view = new GraphicsRenderer(svg, this)
      this.resetForFwd()
      this.fwdSlice()
   }

   resetForFwd (): void {
      setallα(ann.top, this.e)
   }

   fwdSlice (): void {
      Eval.eval_fwd(this.tv)
      this.direction = Direction.Fwd
      this.draw()
   }

   resetForBwd (): void {
      setallα(ann.bot, this.e)
      Eval.eval_fwd(this.tv) // to clear all annotations
   }

   bwdSlice (): void {
      Eval.eval_bwd(this.tv)
      this.direction = Direction.Bwd
      this.draw()
   }

   get svg (): SVGSVGElement {
      return this.view.ancestors[0] as SVGSVGElement
   }

   getGraphics (): GraphicsElement {
      return as(this.tv.v as Value, GraphicsElement)
   }

   draw (): void {
      this.view.render(this.getGraphics())
   }
}

// "Data" defined to be expression bound by first "let" in user code; must be already in normal form.
class App {
   dataView: View
   graphicsView: View

   constructor () {
      // Two programs share the expression data_e. May be problematic for setting/clearing annotations?
      this.graphicsView = new View(parse(load("bar-chart")), this.createSvg(400, 400, false))
      let here: Cursor = new Cursor(this.graphicsView.e)
      here.skipImports().toDef("data").to(Expr.Let, "e")
      const data_e: Expr = as(here.v, Expr.Constr)
      this.dataView = new View(
         importDefaults(Expr.app(ν(), Expr.var_(ν(), str(ν(), "renderData")), Expr.quote(ν(), data_e))),
         this.createSvg(400, 1200, false)
      )
      document.body.appendChild(this.graphicsView.svg)
      document.body.appendChild(this.dataView.svg)
   }

   createSvg (w: number, h: number, stackDown: boolean): SVGSVGElement {
      const svg: SVGSVGElement = document.createElementNS(svgNS, "svg")
      svg.setAttribute("width", w.toString())
      svg.setAttribute("height", h.toString())
      // See https://vecta.io/blog/guide-to-getting-sharp-and-crisp-svg-images
      svg.setAttribute("viewBox", `-0.5 -0.5 ${w.toString()} ${h.toString()}`)
      svg.setAttribute("viewBox", `-0.5 ${(stackDown ? -0.5 - h : -0.5).toString()} ${w.toString()} ${h.toString()}`)
      // Don't use SVG transform internally, but compute our own transformations (to avoid having non-integer
      // pixel attributes). But to invert y-axis use an SVG transform:
      svg.setAttribute("transform", "scale(1,-1)")
      svg.style.verticalAlign = "top"
      svg.style.display = "inline-block"
      return svg
   }
}

new App()
