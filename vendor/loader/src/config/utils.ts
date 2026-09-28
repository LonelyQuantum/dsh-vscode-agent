import { valueMap } from '@deepseek-ai/cosmokit'

let evaluator: typeof evaluate | undefined

/**
 * Evaluate a JavaScript expression against a loader context scope. Literal-only
 * clients do not compile JavaScript and can prohibit string evaluation with CSP.
 * @param ctx - Loader context exposed to the expression.
 * @param expr - JavaScript expression supplied by trusted configuration.
 * @returns The expression's value; YAML expressions can return any runtime value.
 */
export function evaluate(ctx: object, expr: string): any {
  // eslint-disable-next-line no-new-func
  evaluator ??= new Function('ctx', 'expr', `
    with (ctx) {
      return eval(expr)
    }
  `) as typeof evaluate
  return evaluator(ctx, expr)
}

/** Recursively replace YAML `!!js` expression nodes with evaluated values. */
export function interpolate(ctx: object, value: any) {
  if (isJsExpr(value)) {
    return evaluate(ctx, value.__jsExpr)
  } else if (!value || typeof value !== 'object') {
    return value
  } else if (Array.isArray(value)) {
    return value.map(item => interpolate(ctx, item))
  } else {
    return valueMap(value, item => interpolate(ctx, item))
  }
}

/** Return true when a value is a serialized loader JavaScript expression. */
export function isJsExpr(value: any): value is JsExpr {
  return value instanceof Object && '__jsExpr' in value
}

/** Serialized JavaScript expression produced by the include YAML tag. */
export interface JsExpr {
  __jsExpr: string
}
