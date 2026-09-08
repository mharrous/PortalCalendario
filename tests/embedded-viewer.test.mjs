import assert from "node:assert/strict";
import test from "node:test";

import { resolveEmbeddedViewer } from "../worker.js";

test("usa un perfil interno de solo lectura si no hay correo configurado", () => {
  const viewer = resolveEmbeddedViewer([], "");

  assert.deepEqual(viewer, {
    id: "embedded-readonly",
    nombre: "Consulta Jornadas",
    email: "",
    departamento: "",
    activo: true,
    rol: "consulta",
  });
});

test("mantiene el perfil configurado cuando existe y está activo", () => {
  const profile = {
    id: "profile-1",
    nombre: "Perfil configurado",
    email: "consulta@example.test",
    activo: true,
  };

  assert.equal(
    resolveEmbeddedViewer([profile], "consulta@example.test"),
    profile,
  );
});

test("no permite usar un perfil configurado desactivado", () => {
  const profile = {
    id: "profile-1",
    email: "consulta@example.test",
    activo: false,
  };

  assert.equal(
    resolveEmbeddedViewer([profile], "consulta@example.test"),
    null,
  );
});
