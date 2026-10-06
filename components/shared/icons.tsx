import type { LucideIcon } from "lucide-react";
import {
  Scissors,
  Brush,
  Droplets,
  Wind,
  Palette,
  Hand,
  Footprints,
  Eye,
  Flower2,
  Waves,
  Sun,
  Bath,
  Syringe,
  FlaskConical,
  Baby,
  UserRound,
  Users2,
  Package,
  Gift,
  SprayCan,
  Pill,
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

// ===== أيقونات فئات الخدمات — بديل الإيموجي (يُخزَّن الاسم في DB) =====
//
// ⚠️ كانت **مجموعة منيو مطعم**: بيتزا · بيرة · شوربة · سمك · لحمة · فراخ …
// ٢٤ من ٣٤ أيقونة أكل في نسخة لمحل حلاقة. وده مش تفصيلة شكل: صاحب المحل بيفتح
// القايمة يدوّر على «صبغة» فيلاقي «كرواسون» — فيفتكر النسخة مش بتاعته.
//
// 🔴 **الأسماء دي بتتخزّن في الداتابيز** (`categories.icon`). فأي اسم قديم
// مش موجود هنا بيرجع `undefined` و`CategoryIcon` بيعرض الافتراضي — مفيش كراش.
// بس كنا بنسيب الأسماء المشتركة اللي ليها معنى في الصالون (gift · spray · pill
// · ice · package) زي ما هي عشان أي فئة قديمة تفضل بأيقونتها.
export const CATEGORY_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: "scissors", Icon: Scissors },
  { name: "brush", Icon: Brush },
  { name: "blowdry", Icon: Wind },
  { name: "wash", Icon: Droplets },
  { name: "color", Icon: Palette },
  { name: "nails", Icon: Hand },
  { name: "pedicure", Icon: Footprints },
  { name: "lashes", Icon: Eye },
  { name: "makeup", Icon: Flower2 },
  { name: "massage", Icon: Waves },
  { name: "tanning", Icon: Sun },
  { name: "bath", Icon: Bath },
  { name: "injection", Icon: Syringe },
  { name: "treatment", Icon: FlaskConical },
  { name: "kids", Icon: Baby },
  { name: "women", Icon: UserRound },
  { name: "men", Icon: Users2 },
  // ===== أسماء مشتركة فاضلة زي ما هي (فئة قديمة تفضل بأيقونتها) =====
  { name: "spray", Icon: SprayCan },
  { name: "pill", Icon: Pill },
  { name: "ice", Icon: Snowflake },
  { name: "gift", Icon: Gift },
  { name: "package", Icon: Package },
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
