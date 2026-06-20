declare module '@jspawn/ghostscript-wasm/gs.mjs' {
  const gs: (options?: any) => Promise<any>;
  export default gs;
}
