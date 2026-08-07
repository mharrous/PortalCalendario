import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(
  new URL("../public/index.html", import.meta.url),
  "utf8",
);

test("la vista mensual conserva siete columnas de lunes a domingo", () => {
  assert.match(
    html,
    /\.compact-month \.grid\s*\{[^}]*grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/s,
  );
  assert.doesNotMatch(
    html,
    /\.compact-month \.weekdays\s*\{\s*display:none!important\s*\}/,
  );
});

test("el calendario mensual incluye huecos para alinear el primer día", () => {
  assert.match(
    html,
    /const cells=calendarCellsForMonth\(year,month\)/,
  );
  assert.match(
    html,
    /month-card-placeholder/,
  );
});

test("el modo incrustado adapta las celdas sin desbordamiento horizontal", () => {
  assert.match(
    html,
    /body\.embedded-mode \.compact-month \.grid\s*\{[^}]*grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/s,
  );
  assert.match(
    html,
    /body\.embedded-mode \.compact-month \.grid > \.day\.month-card\s*\{[^}]*min-width:0/s,
  );
});

test("el primer dia se coloca en su columna real aunque haya cache visual", () => {
  assert.match(
    html,
    /const firstDayPlacement=d\.getDate\(\)===1\?`style="grid-column-start:\$\{mondayOffset\(d\)\+1\}"`:''/,
  );
});
