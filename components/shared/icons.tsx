import type { LucideIcon } from "lucide-react";
import {
  Coffee,
  CupSoda,
  GlassWater,
  Wine,
  Beer,
  Milk,
  CakeSlice,
  Cookie,
  Donut,
  Candy,
  Croissant,
  Sandwich,
  Pizza,
  Popcorn,
  IceCreamCone,
  Salad,
  Egg,
  Soup,
  Fish,
  Beef,
  Drumstick,
  Apple,
  Carrot,
  Wheat,
  ShoppingBag,
  ShoppingCart,
  Package,
  Utensils,
  Gift,
  SprayCan,
  Shirt,
  Pill,
  Cigarette,
  Snowflake,
  User,
  Zap,
  Home,
  Boxes,
  Wrench,
  Sparkles,
  Receipt,
  Crown,
  Heart,
  AlertTriangle,
  HeartCrack,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExpenseCategory } from "@/shared/management";
import type { Classification } from "@/shared/customers";

// ===== أيقونات الفئات — بديل الإيموجي (يُخزَّن الاسم في DB) =====
export const CATEGORY_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: "coffee", Icon: Coffee },
  { name: "cup-soda", Icon: CupSoda },
  { name: "glass-water", Icon: GlassWater },
  { name: "wine", Icon: Wine },
  { name: "beer", Icon: Beer },
  { name: "milk", Icon: Milk },
  { name: "cake", Icon: CakeSlice },
  { name: "cookie", Icon: Cookie },
  { name: "donut", Icon: Donut },
  { name: "candy", Icon: Candy },
  { name: "croissant", Icon: Croissant },
  { name: "sandwich", Icon: Sandwich },
  { name: "pizza", Icon: Pizza },
  { name: "popcorn", Icon: Popcorn },
  { name: "ice-cream", Icon: IceCreamCone },
  { name: "salad", Icon: Salad },
  { name: "egg", Icon: Egg },
  { name: "soup", Icon: Soup },
  { name: "fish", Icon: Fish },
  { name: "beef", Icon: Beef },
  { name: "chicken", Icon: Drumstick },
  { name: "apple", Icon: Apple },
  { name: "carrot", Icon: Carrot },
  { name: "bread", Icon: Wheat },
  { name: "bag", Icon: ShoppingBag },
  { name: "cart", Icon: ShoppingCart },
  { name: "package", Icon: Package },
  { name: "utensils", Icon: Utensils },
  { name: "gift", Icon: Gift },
  { name: "spray", Icon: SprayCan },
  { name: "shirt", Icon: Shirt },
  { name: "pill", Icon: Pill },
  { name: "cigarette", Icon: Cigarette },
  { name: "ice", Icon: Snowflake },
];

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICONS.map((c) => [c.name, c.Icon])
);

// يعرض أيقونة الفئة بالاسم. لو القيمة قديمة (إيموجي) يعرضها كنص، غير كده أيقونة افتراضية.
export function CategoryIcon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  const Icon = name ? CATEGORY_ICON_MAP[name] : undefined;
  if (Icon) return <Icon className={className} />;
  if (name && !/^[a-z0-9_-]+$/i.test(name)) {
    return (
      <span className={cn("inline-flex items-center justify-center", className)}>
        {name}
      </span>
    );
  }
  return <Package className={className} />;
}

// ===== أيقونات فئات المصاريف =====
export const EXPENSE_CATEGORY_ICON: Record<ExpenseCategory, LucideIcon> = {
  staff: User,
  inventory: Package,
  utilities: Zap,
  resources: Boxes,
  maintenance: Wrench,
  cleaning: Sparkles,
  other: Receipt,
};

// ===== أيقونات تصنيف العملاء =====
export const CLASSIFICATION_ICON: Record<Classification, LucideIcon> = {
  champion: Crown,
  loyal: Heart,
  at_risk: AlertTriangle,
  lost: HeartCrack,
  new: Star,
};
