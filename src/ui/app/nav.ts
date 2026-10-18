/**
 * خريطة التنقل الأصلية للبرنامج.
 *
 * الترتيب يتبع دورة العمل اليومية في مكتب المحاماة المصرية:
 * ما يجب أن يُنجز اليوم ← العمل القانوني على الملف ← الأطراف والوثائق ←
 * إدارة المكتب. كل وجهة لها صفحة حقيقية، ولا توجد عناصر تنقل بلا مضمون.
 */
export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
  readonly badge?: 'tasks' | 'hearings' | 'finance';
}

export interface NavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'day',
    label: 'اليوم',
    items: [
      {
        path: '/today',
        label: 'مكتب اليوم',
        icon: 'today',
        description: 'لوحة اليوم: الجلسات والمهام والمستحقات التي تحتاج قرارًا الآن.',
        badge: 'hearings',
      },
      { path: '/tasks', label: 'المهام والأعمال', icon: 'tasks', description: 'كل ما يجب تنفيذه، مربوطًا بالملفات والقضايا.', badge: 'tasks' },
      { path: '/appointments', label: 'المواعيد', icon: 'calendar-clock', description: 'مواعيد المقابلات والاتصالات والزيارات.' },
    ],
  },
  {
    id: 'legal',
    label: 'العمل القانوني',
    items: [
      { path: '/files', label: 'الملفات', icon: 'folder', description: 'ملفات العملاء: المحتوى والعلاقات والمستندات.' },
      { path: '/cases', label: 'القضايا', icon: 'scale', description: 'القضايا أمام المحاكم ودرجات التقاضي.' },
      { path: '/hearings', label: 'الجلسات', icon: 'gavel', description: 'جدول الجلسات وتسجيل نتائجها وتأجيلها.' },
      { path: '/judgments', label: 'الأحكام', icon: 'stamp', description: 'الأحكام وطرق الطعن والتنفيذ.' },
      { path: '/execution', label: 'أعمال التنفيذ', icon: 'layers', description: 'ملفات التنفيذ وإجراءاته ومستحقاته.' },
      { path: '/announcements', label: 'الإعلانات والإنابات', icon: 'send', description: 'إعلانات الخصوم والإنابات القضائية.' },
    ],
  },
  {
    id: 'parties',
    label: 'الأطراف والوثائق',
    items: [
      { path: '/clients', label: 'العملاء', icon: 'users', description: 'سجل العملاء وبياناتهم وملفاتهم.' },
      { path: '/parties', label: 'الأطراف والخصوم', icon: 'user', description: 'الأشخاص والشركات والأطراف في الدعاوى.' },
      { path: '/documents', label: 'المستندات', icon: 'document', description: 'المستندات ونسخها وربطها بالملفات.' },
      { path: '/contracts', label: 'العقود والتوكيلات', icon: 'briefcase', description: 'العقود والتوكيلات الرسمية ومدتها.' },
    ],
  },
  {
    id: 'office',
    label: 'إدارة المكتب',
    items: [
      { path: '/finance', label: 'المالية', icon: 'wallet', description: 'الأتعاب والمستحقات والمدفوعات والمصروفات.', badge: 'finance' },
      { path: '/reports', label: 'التقارير', icon: 'reports', description: 'تقارير قابلة للطباعة من بيانات المكتب الفعلية.' },
      { path: '/archive', label: 'الأرشيف', icon: 'archive', description: 'السجلات المؤرشفة والمحذوفة القابلة للاستعادة.' },
      { path: '/settings', label: 'الإعدادات', icon: 'settings', description: 'بيانات المكتب والمظهر والجداول والنسخ الاحتياطي.' },
    ],
  },
];

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** التنقل السفلي على الهاتف: أهم خمس وجهات + «المزيد» يفتح الدرج. */
export const BOTTOM_NAV: ReadonlyArray<NavItem | { path: 'more'; label: string; icon: string; description: string }> = [
  { path: '/today', label: 'اليوم', icon: 'today', description: 'مكتب اليوم', badge: 'hearings' },
  { path: '/files', label: 'الملفات', icon: 'folder', description: 'الملفات' },
  { path: '/cases', label: 'القضايا', icon: 'scale', description: 'القضايا' },
  { path: '/hearings', label: 'الجلسات', icon: 'gavel', description: 'الجلسات' },
  { path: 'more', label: 'المزيد', icon: 'menu', description: 'بقية الأقسام' },
];

const TITLES: Record<string, { section: string; title: string }> = {
  '/today': { section: 'اليوم', title: 'مكتب اليوم' },
  '/tasks': { section: 'اليوم', title: 'المهام والأعمال' },
  '/appointments': { section: 'اليوم', title: 'المواعيد' },
  '/files': { section: 'العمل القانوني', title: 'الملفات' },
  '/cases': { section: 'العمل القانوني', title: 'القضايا' },
  '/hearings': { section: 'العمل القانوني', title: 'الجلسات' },
  '/judgments': { section: 'العمل القانوني', title: 'الأحكام' },
  '/execution': { section: 'العمل القانوني', title: 'أعمال التنفيذ' },
  '/announcements': { section: 'العمل القانوني', title: 'الإعلانات والإنابات' },
  '/clients': { section: 'الأطراف والوثائق', title: 'العملاء' },
  '/parties': { section: 'الأطراف والوثائق', title: 'الأطراف والخصوم' },
  '/documents': { section: 'الأطراف والوثائق', title: 'المستندات' },
  '/contracts': { section: 'الأطراف والوثائق', title: 'العقود والتوكيلات' },
  '/finance': { section: 'إدارة المكتب', title: 'المالية' },
  '/reports': { section: 'إدارة المكتب', title: 'التقارير' },
  '/archive': { section: 'إدارة المكتب', title: 'الأرشيف' },
  '/settings': { section: 'إدارة المكتب', title: 'الإعدادات' },
  '/search': { section: 'البحث', title: 'نتائج البحث' },
};

export function navTitle(path: string): { section: string; title: string } {
  const base = `/${path.split('/').filter(Boolean)[0] ?? 'today'}`;
  if (TITLES[base]) return TITLES[base];
  return { section: 'مِداد', title: 'مِداد' };
}

export function activeNavPath(path: string): string {
  const segment = path.split('/').filter(Boolean)[0] ?? 'today';
  return `/${segment}`;
}
