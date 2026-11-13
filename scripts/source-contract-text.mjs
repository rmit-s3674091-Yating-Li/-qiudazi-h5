// Formatter-independent spelling for static wiring assertions only.
// Behavioral tests still compile and execute the original source unchanged.
export function sourceContractText(source) {
  return source
    .replace(/\s+/g, "")
    .replace(/\(([A-Za-z_$][\w$]*)\)=>/g, "$1=>")
    .replace(/,([)\]}])/g, "$1")
    .replace(/;}/g, "}");
}
