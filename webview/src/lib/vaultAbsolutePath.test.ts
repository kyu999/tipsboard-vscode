import { describe, expect, it } from "vitest";
import { joinVaultAbsolutePath } from "./vaultAbsolutePath";

describe("joinVaultAbsolutePath", () => {
  it("joins POSIX vault roots with forward slashes", () => {
    expect(joinVaultAbsolutePath("/Users/me/vault", "assets/files/a.pdf")).toBe("/Users/me/vault/assets/files/a.pdf");
    expect(joinVaultAbsolutePath("/Users/me/vault/", "assets/files/a.pdf")).toBe("/Users/me/vault/assets/files/a.pdf");
  });

  it("joins Windows-style vault roots with backslashes", () => {
    expect(joinVaultAbsolutePath("C:\\Users\\me\\vault", "assets/files/a.pdf")).toBe(
      "C:\\Users\\me\\vault\\assets\\files\\a.pdf",
    );
  });
});
