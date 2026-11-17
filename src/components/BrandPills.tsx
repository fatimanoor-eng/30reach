import { Check, Plus } from "lucide-react";
import { compareColor, isBlocked, MAX_COMPARE, type CompareColor } from "../lib/brand-selection";
import { useBrandSelection } from "../lib/brand-selection-context";
import type { Brand } from "../lib/sample-data";
import { Avatar } from "./Avatar";
import { Tooltip } from "./Tooltip";

/** Avatar colour on a lit (ink) pill = the brand's compare colour. 1st is ink, so its avatar is white. */
const avatarTone: Record<CompareColor, "white" | "pop" | "blue"> = {
  ink: "white",
  pop: "pop",
  blue: "blue",
};

const pillBase =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border pr-3 pl-1.5 text-body-sm transition-colors md:h-9";
const pillOff = "border-line bg-surface text-ink hover:border-ink/30";
const pillOn = "border-ink bg-ink text-white";

/**
 * Brand pills (DESIGN_SYSTEM › Brand pill). Selection is shared across Overview, Instagram and TikTok.
 * Mobile: one row that scrolls sideways. Tablet/desktop: wraps.
 */
export function BrandPills({ brands }: { brands: Brand[] }) {
  const { selected, toggle, clear } = useBrandSelection();
  const all = selected.length === 0;

  return (
    <div
      role="group"
      aria-label="Brands"
      className="-mx-4 flex [scrollbar-width:none] items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
    >
      <button
        type="button"
        aria-pressed={all}
        onClick={clear}
        className={`${pillBase} ${all ? pillOn : pillOff}`}
      >
        <Avatar initials="All" tone="all" />
        All brands
      </button>

      {brands.map((brand) => {
        const color = compareColor(selected, brand.id);
        const blocked = isBlocked(selected, brand.id);
        return (
          <Tooltip
            key={brand.id}
            enabled={blocked}
            content={`Compare up to ${MAX_COMPARE} brands`}
            className="shrink-0"
          >
            {(tip) => (
              <button
                type="button"
                aria-pressed={color !== null}
                aria-disabled={blocked || undefined}
                aria-describedby={tip["aria-describedby"] || undefined}
                onClick={(e) => (blocked ? tip.onToggle(e) : toggle(brand.id))}
                className={`${pillBase} ${color ? pillOn : pillOff} ${blocked ? "cursor-not-allowed opacity-40 hover:border-line" : ""}`}
              >
                <Avatar initials={brand.initials} tone={color ? avatarTone[color] : "brand"} />
                {brand.name}
                {color ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Plus size={16} aria-hidden="true" className="text-muted" />
                )}
              </button>
            )}
          </Tooltip>
        );
      })}

      {!all && (
        <button
          type="button"
          onClick={clear}
          className="min-h-11 shrink-0 px-2 text-body-sm text-blue hover:underline md:min-h-9"
        >
          Clear
        </button>
      )}
    </div>
  );
}
