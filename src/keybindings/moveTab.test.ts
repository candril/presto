import { describe, expect, test } from "bun:test"
import { defaultBindings } from "./defaults"
import { createKeybindings } from "./hook"
import type { Config } from "../config"

describe("tab.moveLeft / tab.moveRight bindings", () => {
  test("default to { and } and no other action shares those keys", () => {
    expect(defaultBindings["tab.moveLeft"]).toBe("{")
    expect(defaultBindings["tab.moveRight"]).toBe("}")

    const onBraces = Object.entries(defaultBindings)
      .filter(([, binding]) => binding === "{" || binding === "}")
      .map(([action]) => action)
      .sort()
    expect(onBraces).toEqual(["tab.moveLeft", "tab.moveRight"])
  })

  // The terminal delivers { and } as the character itself, without shift.
  test("match the unshifted { and } key events", () => {
    const keys = createKeybindings({ keys: {} } as unknown as Config)

    expect(keys.matches({ name: "{" } as any, "tab.moveLeft")).toBe(true)
    expect(keys.matches({ name: "}" } as any, "tab.moveRight")).toBe(true)
    expect(keys.matches({ name: "[" } as any, "tab.moveLeft")).toBe(false)
    expect(keys.matches({ name: "]" } as any, "tab.moveRight")).toBe(false)
  })

  test("can be rebound under keys", () => {
    const keys = createKeybindings({ keys: { "tab.moveLeft": "ctrl+h", "tab.moveRight": "L" } } as unknown as Config)

    expect(keys.matches({ name: "h", ctrl: true } as any, "tab.moveLeft")).toBe(true)
    expect(keys.matches({ name: "l", shift: true } as any, "tab.moveRight")).toBe(true)
    expect(keys.matches({ name: "{" } as any, "tab.moveLeft")).toBe(false)
  })
})
