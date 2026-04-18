"use client";

import type { LucideProps } from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import {
  Book,
  Calendar,
  FileText,
  Plus,
  ArrowRight,
  ArrowLeft,
  Search,
  Check,
  X,
  Clock,
  Sparkles,
  Upload,
  GraduationCap,
  ChevronRight,
  Link,
  Flag,
  Layers,
  FlaskConical,
  Brain,
  ChevronLeft,
} from "lucide-react";

export type IconName =
  | "book"
  | "calendar"
  | "file-text"
  | "plus"
  | "arrow-right"
  | "arrow-left"
  | "search"
  | "check"
  | "x"
  | "clock"
  | "sparkles"
  | "upload"
  | "graduation-cap"
  | "chevron-right"
  | "link"
  | "flag"
  | "layers"
  | "flask-conical"
  | "brain"
  | "chevron-left";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;

const ICON_MAP: Record<IconName, LucideIcon> = {
  "book": Book,
  "calendar": Calendar,
  "file-text": FileText,
  "plus": Plus,
  "arrow-right": ArrowRight,
  "arrow-left": ArrowLeft,
  "search": Search,
  "check": Check,
  "x": X,
  "clock": Clock,
  "sparkles": Sparkles,
  "upload": Upload,
  "graduation-cap": GraduationCap,
  "chevron-right": ChevronRight,
  "link": Link,
  "flag": Flag,
  "layers": Layers,
  "flask-conical": FlaskConical,
  "brain": Brain,
  "chevron-left": ChevronLeft,
};

export function Icon({ name, size = 16, className }: IconProps): JSX.Element {
  const LucideIcon = ICON_MAP[name];
  return <LucideIcon size={size} strokeWidth={1.5} className={className} />;
}
