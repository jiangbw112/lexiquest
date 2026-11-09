# Warm text contrast (b2.2)

Method: WCAG 2.x relative luminance of the **declared text fill** against the **declared background fill**. This is not a sample of the lightest or darkest pixel in a screenshot, and a stroke is not part of the ratio. Header and page titles use ink `#3B2A20` with no stroke.

| Pair | Text | Background | Ratio | 4.5:1 |
|---|---|---|---:|---|
| Ink on cream | `#3B2A20` | `#FFF4DC` | 12.50:1 | pass |
| Muted on cream | `#46363A` | `#FFF4DC` | 10.40:1 | pass |
| Error on cream | `#834735` | `#FFF4DC` | 6.59:1 | pass |
| Disabled label on disabled fill | `#3F2E25` | `#CFC4B2` | 7.48:1 | pass |
| Cream on terra button | `#FFF4DC` | `#A9432B` | 5.45:1 | pass |
| Cream on deep teal button | `#FFF4DC` | `#1F6F64` | 5.47:1 | pass |
| Cream on selected chip | `#FFF4DC` | `#266B65` | 5.70:1 | pass |

The terra, deep teal, and selected-chip fills are the b2.2 face colors painted into these eleven atlas frames: `btn_action_coral_normal`, `btn_action_coral_hover`, `btn_action_coral_pressed`, `hp_fill_coral`, `btn_action_teal_normal`, `btn_action_teal_hover`, `btn_action_teal_pressed`, `hp_fill_teal`, `chip_on_normal`, `chip_on_hover`, `chip_on_pressed`. Hover and pressed keep their shading. The ink outline `#3B2A20` on those frames is unchanged. The same hexes are `TERRA`, `TEAL_DEEP`, `CHIP_ON`, and `INK` in `src/game/warm/theme.ts`, and the pairs above are `WARM_TEXT_PAIRS` in `src/domain/contrast.ts`.
