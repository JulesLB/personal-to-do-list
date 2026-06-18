import { defineConfig } from "vitest/config";

// .mts so Next's tsconfig (which globs **/*.ts) doesn't typecheck it.
// Referee phone numbers are stubbed here because waLink reads them at module
// load, so they must exist before the test files import it.
export default defineConfig({
  test: {
    env: {
      WIFE_WHATSAPP: "85291234567",
      SISTER_WHATSAPP: "85298765432",
      COLLEAGUE_WHATSAPP: "85255555555",
    },
  },
});
