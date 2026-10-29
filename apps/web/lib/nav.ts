export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: "🏠" },
      { href: "/calendar", label: "Calendar & appointments", icon: "📅" },
      { href: "/tasks", label: "Checklist & timeline", icon: "✅" },
      { href: "/move", label: "Move details", icon: "🚚" },
      { href: "/travel", label: "Work trip", icon: "✈️" },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/family", label: "Family", icon: "👨‍👩‍👧" },
      { href: "/pets", label: "Pets", icon: "🐾" },
    ],
  },
  {
    title: "Belongings",
    items: [
      { href: "/scan", label: "Quick scan", icon: "▦" },
      { href: "/inventory", label: "Inventory by room", icon: "🛋️" },
      { href: "/boxes", label: "Boxes", icon: "📦" },
      { href: "/labels", label: "QR label maker", icon: "🏷️" },
      { href: "/books", label: "Books", icon: "📚" },
      { href: "/sell", label: "Sell & donate", icon: "💲" },
    ],
  },
  {
    title: "Logistics",
    items: [
      { href: "/quotes", label: "Mover quotes", icon: "🚛" },
      { href: "/apartments", label: "Apartments & rentals", icon: "🏢" },
      { href: "/documents", label: "Paperwork", icon: "📄" },
      { href: "/bills", label: "Bills & income", icon: "🧾" },
      { href: "/subscriptions", label: "Subscriptions", icon: "🔁" },
      { href: "/budget", label: "Moving budget", icon: "💵" },
      { href: "/utilities", label: "Utilities", icon: "💡" },
      { href: "/addresses", label: "Address changes", icon: "📮" },
      { href: "/contacts", label: "Contacts", icon: "📇" },
    ],
  },
  {
    title: "More",
    items: [
      { href: "/reports", label: "Reports & export", icon: "🖨️" },
      { href: "/settings", label: "Settings & sharing", icon: "⚙️" },
    ],
  },
];

export const MOBILE_TABS: NavItem[] = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/scan", label: "Scan", icon: "▦" },
  { href: "/inventory", label: "Inventory", icon: "🛋️" },
];
