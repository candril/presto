import { describe, expect, test } from "bun:test"
import { getTabCommands } from "./definitions"
import type { CommandContext } from "./types"
import type { AppAction } from "../state"
import type { Tab } from "../tabs/types"

const tab = (id: string): Tab => ({ id, title: id, filterQuery: "", hasNotification: false, selectedIndex: 0 })

const context = (ids: string[], dispatched: AppAction[] = []): CommandContext =>
  ({
    tabs: ids.map(tab),
    activeTabId: ids[0],
    dispatch: (action: AppAction) => dispatched.push(action),
  }) as unknown as CommandContext

const moveIds = (ctx: CommandContext) =>
  getTabCommands(ctx)
    .map((c) => c.id)
    .filter((id) => id.startsWith("tab.move"))

describe("Move Tab palette commands", () => {
  test("not offered with a single tab", () => {
    expect(moveIds(context(["a"]))).toEqual([])
  })

  test("offered with more than one tab", () => {
    const cmds = getTabCommands(context(["a", "b"]))

    expect(cmds.find((c) => c.id === "tab.moveLeft")?.label).toBe("Move Tab Left")
    expect(cmds.find((c) => c.id === "tab.moveRight")?.label).toBe("Move Tab Right")
  })

  test("dispatch MOVE_TAB with the matching delta", async () => {
    const dispatched: AppAction[] = []
    const ctx = context(["a", "b"], dispatched)
    const cmds = getTabCommands(ctx)

    await cmds.find((c) => c.id === "tab.moveLeft")!.execute(ctx)
    await cmds.find((c) => c.id === "tab.moveRight")!.execute(ctx)

    expect(dispatched).toEqual([
      { type: "MOVE_TAB", delta: -1 },
      { type: "MOVE_TAB", delta: 1 },
    ])
  })
})
