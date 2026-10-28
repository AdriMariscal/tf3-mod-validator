-- Remembers the last road style the player picked.
local function save(style)
  api.gui.game.setGuiSaveData("demo_roads", { style = style })
end
