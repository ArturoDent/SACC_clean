declare module "js-beautify" {
  export function html(source: string, options?: any): string;
  export function js(source: string, options?: any): string;
  export function css(source: string, options?: any): string;
  const _default: {
    html: typeof html;
    js: typeof js;
    css: typeof css;
  };
  export default _default;
}
