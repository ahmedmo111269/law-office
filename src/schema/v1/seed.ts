/**
 * Seed data for schema v1.
 *
 * Every seed row gets a deterministic UUID (uuidv5) so two devices that
 * initialise independently produce identical reference rows instead of
 * duplicates. Seed rows are inserted by migration 1 with
 * `sync_status = 'local'`; they do not need to travel through the outbox
 * because every device creates exactly the same rows.
 *
 * System lists are extensible. The `is_system` flag means "seeded by the
 * application"; it does not seal the list. Codes are stable and must never be
 * renamed because user data may reference them.
 */

export interface SeedLookupItem {
  readonly code: string;
  readonly nameAr: string;
  readonly nameEn?: string;
}

export interface SeedLookupList {
  readonly code: string;
  readonly nameAr: string;
  readonly nameEn?: string;
  readonly description?: string;
  readonly items: readonly SeedLookupItem[];
}

const item = (code: string, nameAr: string, nameEn?: string): SeedLookupItem =>
  nameEn === undefined ? { code, nameAr } : { code, nameAr, nameEn };

export const SEED_LOOKUP_LISTS: readonly SeedLookupList[] = [
  {
    code: 'party_status',
    nameAr: 'حالة الطرف',
    nameEn: 'Party status',
    items: [
      item('active', 'نشط', 'Active'),
      item('inactive', 'غير نشط', 'Inactive'),
      item('archived', 'مؤرشف', 'Archived'),
      item('merged', 'مدموج', 'Merged'),
    ],
  },
  {
    code: 'contact_type',
    nameAr: 'نوع وسيلة الاتصال',
    nameEn: 'Contact type',
    items: [
      item('mobile', 'هاتف محمول', 'Mobile'),
      item('phone', 'هاتف أرضي', 'Phone'),
      item('whatsapp', 'واتساب', 'WhatsApp'),
      item('email', 'بريد إلكتروني', 'Email'),
      item('fax', 'فاكس', 'Fax'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'address_type',
    nameAr: 'نوع العنوان',
    nameEn: 'Address type',
    items: [
      item('residential', 'سكن', 'Residential'),
      item('work', 'عمل', 'Work'),
      item('mailing', 'مراسلات', 'Mailing'),
      item('registered_office', 'مقر مسجل', 'Registered office'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'legal_form',
    nameAr: 'الشكل القانوني',
    nameEn: 'Legal form',
    items: [
      item('individual', 'شخص طبيعي', 'Individual'),
      item('sole_proprietorship', 'منشأة فردية', 'Sole proprietorship'),
      item('llc', 'شركة ذات مسؤولية محدودة', 'LLC'),
      item('joint_stock', 'شركة مساهمة', 'Joint stock company'),
      item('partnership', 'شركة تضامن', 'General partnership'),
      item('limited_partnership', 'شركة توصية', 'Limited partnership'),
      item('joint_venture', 'محاصة', 'Joint venture'),
      item('association', 'جمعية أو مؤسسة', 'Association'),
      item('government', 'جهة حكومية', 'Government body'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'marital_status',
    nameAr: 'الحالة الاجتماعية',
    nameEn: 'Marital status',
    items: [
      item('single', 'أعزب', 'Single'),
      item('married', 'متزوج', 'Married'),
      item('divorced', 'مطلق', 'Divorced'),
      item('widowed', 'أرمل', 'Widowed'),
      item('unknown', 'غير محدد', 'Unknown'),
    ],
  },
  {
    code: 'party_relation_type',
    nameAr: 'نوع العلاقة بين الأطراف',
    nameEn: 'Party relationship type',
    items: [
      item('spouse', 'زوج أو زوجة', 'Spouse'),
      item('parent', 'والد أو والدة', 'Parent'),
      item('child', 'ابن أو ابنة', 'Child'),
      item('sibling', 'شقيق أو شقيقة', 'Sibling'),
      item('guardian', 'ولي أو وصي', 'Guardian'),
      item('ward', 'قاصر تحت الولاية', 'Ward'),
      item('authorized_signatory', 'مفوض بالتوقيع', 'Authorized signatory'),
      item('representative', 'ممثل', 'Representative'),
      item('agent', 'وكيل', 'Agent'),
      item('employer', 'جهة عمل', 'Employer'),
      item('employee', 'موظف', 'Employee'),
      item('partner', 'شريك', 'Partner'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'client_status',
    nameAr: 'حالة الموكل',
    nameEn: 'Client status',
    items: [
      item('prospective', 'موكل محتمل', 'Prospective'),
      item('active', 'نشط', 'Active'),
      item('inactive', 'غير نشط', 'Inactive'),
      item('former', 'موكل سابق', 'Former'),
      item('archived', 'مؤرشف', 'Archived'),
    ],
  },
  {
    code: 'client_source',
    nameAr: 'مصدر الموكل',
    nameEn: 'Client source',
    items: [
      item('referral', 'ترشيح', 'Referral'),
      item('website', 'موقع إلكتروني', 'Website'),
      item('social_media', 'تواصل اجتماعي', 'Social media'),
      item('walk_in', 'زيارة مباشرة', 'Walk-in'),
      item('existing_client', 'موكل حالي', 'Existing client'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'interaction_channel',
    nameAr: 'قناة التواصل',
    nameEn: 'Interaction channel',
    items: [
      item('phone', 'هاتف', 'Phone'),
      item('whatsapp', 'واتساب', 'WhatsApp'),
      item('email', 'بريد إلكتروني', 'Email'),
      item('meeting', 'مقابلة', 'Meeting'),
      item('letter', 'خطاب', 'Letter'),
      item('court', 'محكمة', 'Court'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'court_kind',
    nameAr: 'نوع المحكمة أو الجهة',
    nameEn: 'Court kind',
    items: [
      item('primary', 'محكمة ابتدائية', 'Primary court'),
      item('appeal', 'محكمة استئناف', 'Court of appeal'),
      item('cassation', 'محكمة النقض', 'Court of cassation'),
      item('administrative', 'محكمة إدارية', 'Administrative court'),
      item('economic', 'محكمة اقتصادية', 'Economic court'),
      item('family', 'محكمة أسرة', 'Family court'),
      item('labor', 'محكمة عمالية', 'Labor court'),
      item('military', 'محكمة عسكرية', 'Military court'),
      item('constitutional', 'محكمة دستورية', 'Constitutional court'),
      item('prosecution', 'نيابة', 'Prosecution'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'practice_area',
    nameAr: 'فرع الممارسة',
    nameEn: 'Practice area',
    items: [
      item('civil', 'مدني', 'Civil'),
      item('commercial', 'تجاري', 'Commercial'),
      item('family', 'أحوال شخصية', 'Family'),
      item('criminal', 'جنائي', 'Criminal'),
      item('administrative', 'مجلس الدولة والمنازعات الإدارية', 'Administrative'),
      item('economic', 'اقتصادي', 'Economic'),
      item('labor', 'عمالي', 'Labor'),
      item('tax', 'ضرائب', 'Tax'),
      item('real_estate_registration', 'شهر عقاري وتوثيق', 'Real estate registration'),
      item('corporate', 'شركات', 'Corporate'),
      item('arbitration', 'تحكيم', 'Arbitration'),
      item('traffic_licensing', 'مرور وتراخيص', 'Traffic and licensing'),
      item('execution', 'تنفيذ', 'Execution'),
      item('guardianship_probate', 'حسبة وتسوية', 'Guardianship and probate'),
      item('experts_appeals', 'خبراء واستئناف', 'Experts and appeals'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'file_type',
    nameAr: 'نوع الملف',
    nameEn: 'File type',
    items: [
      item('primary', 'ملف رئيسي', 'Primary file'),
      item('sub', 'ملف فرعي', 'Sub-file'),
      item('consultation', 'استشارة', 'Consultation'),
      item('contract', 'عقد', 'Contract'),
      item('execution', 'تنفيذ', 'Execution'),
      item('non_judicial', 'عمل غير قضائي', 'Non-judicial'),
      item('arbitration', 'تحكيم', 'Arbitration'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'file_status',
    nameAr: 'حالة الملف',
    nameEn: 'File status',
    items: [
      item('open', 'مفتوح', 'Open'),
      item('suspended', 'معلق', 'Suspended'),
      item('closed', 'مغلق', 'Closed'),
      item('archived', 'مؤرشف', 'Archived'),
    ],
  },
  {
    code: 'priority',
    nameAr: 'الأولوية',
    nameEn: 'Priority',
    items: [
      item('low', 'منخفضة', 'Low'),
      item('normal', 'عادية', 'Normal'),
      item('high', 'مرتفعة', 'High'),
      item('urgent', 'عاجلة', 'Urgent'),
    ],
  },
  {
    code: 'confidentiality',
    nameAr: 'درجة السرية',
    nameEn: 'Confidentiality',
    items: [
      item('normal', 'عادي', 'Normal'),
      item('confidential', 'سري', 'Confidential'),
      item('highly_confidential', 'سري للغاية', 'Highly confidential'),
    ],
  },
  {
    code: 'case_type',
    nameAr: 'نوع الدعوى',
    nameEn: 'Case type',
    items: [
      item('civil', 'مدني', 'Civil'),
      item('commercial', 'تجاري', 'Commercial'),
      item('family', 'أحوال شخصية', 'Family'),
      item('criminal', 'جنائي', 'Criminal'),
      item('administrative', 'إداري', 'Administrative'),
      item('economic', 'اقتصادي', 'Economic'),
      item('labor', 'عمالي', 'Labor'),
      item('tax', 'ضرائب', 'Tax'),
      item('constitutional', 'دستوري', 'Constitutional'),
      item('arbitration', 'تحكيم', 'Arbitration'),
      item('execution', 'تنفيذ', 'Execution'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'litigation_degree',
    nameAr: 'درجة التقاضي',
    nameEn: 'Litigation degree',
    items: [
      item('first_instance', 'ابتدائي', 'First instance'),
      item('appeal', 'استئناف', 'Appeal'),
      item('cassation', 'نقض', 'Cassation'),
      item('administrative_first', 'إداري ابتدائي', 'Administrative first instance'),
      item('administrative_appeal', 'إداري استئناف', 'Administrative appeal'),
      item('supreme_administrative', 'إدارية عليا', 'Supreme administrative'),
      item('execution', 'تنفيذ', 'Execution'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'case_status',
    nameAr: 'حالة القضية',
    nameEn: 'Case status',
    items: [
      item('registered', 'مقيدة', 'Registered'),
      item('under_review', 'تحت المراجعة', 'Under review'),
      item('reserved_for_judgment', 'محجوزة للحكم', 'Reserved for judgment'),
      item('judgment_issued', 'صدر بها حكم', 'Judgment issued'),
      item('appealed', 'مستأنفة', 'Appealed'),
      item('final', 'نهائية', 'Final'),
      item('suspended', 'معلقة', 'Suspended'),
      item('closed', 'مغلقة', 'Closed'),
    ],
  },
  {
    code: 'file_relation_type',
    nameAr: 'نوع ارتباط الملفات',
    nameEn: 'File relation type',
    items: [
      item('related', 'مرتبط', 'Related'),
      item('sub_file', 'ملف فرعي', 'Sub-file'),
      item('appeal', 'استئناف', 'Appeal'),
      item('execution_of', 'تنفيذ لملف', 'Execution of'),
      item('counterclaim', 'دعوى متداخلة', 'Counterclaim'),
      item('duplicate', 'نسخة', 'Duplicate'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'case_relation_type',
    nameAr: 'نوع ارتباط القضايا',
    nameEn: 'Case relation type',
    items: [
      item('related', 'مرتبطة', 'Related'),
      item('appeal_of', 'استئناف عن', 'Appeal of'),
      item('cassation_of', 'نقض في', 'Cassation of'),
      item('counterclaim', 'دعوى متداخلة', 'Counterclaim'),
      item('execution_of', 'تنفيذ لـ', 'Execution of'),
      item('joined', 'مضمومة', 'Joined'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'party_role',
    nameAr: 'صفة الطرف في الملف',
    nameEn: 'Party role',
    items: [
      item('client', 'موكل', 'Client'),
      item('plaintiff', 'مدعي', 'Plaintiff'),
      item('defendant', 'مدعى عليه', 'Defendant'),
      item('victim', 'مجني عليه', 'Victim'),
      item('accused', 'متهم', 'Accused'),
      item('appellant', 'مستأنف', 'Appellant'),
      item('respondent', 'مستأنف ضده', 'Respondent'),
      item('cassation_appellant', 'طاعن', 'Cassation appellant'),
      item('cassation_respondent', 'مطعون ضده', 'Cassation respondent'),
      item('execution_creditor', 'طالب تنفيذ', 'Execution creditor'),
      item('execution_debtor', 'منفذ ضده', 'Execution debtor'),
      item('intervenor', 'خصم متدخل', 'Intervening party'),
      item('subsidiary_appellant', 'مستأنف فرعيًا', 'Subsidiary appellant'),
      item('legal_representative', 'ممثل قانوني', 'Legal representative'),
      item('agent', 'وكيل', 'Agent'),
      item('guardian', 'ولي أو وصي', 'Guardian'),
      item('witness', 'شاهد', 'Witness'),
      item('expert', 'خبير', 'Expert'),
      item('bailiff', 'محضر', 'Bailiff'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'party_side',
    nameAr: 'جانب الطرف',
    nameEn: 'Party side',
    items: [
      item('claimant', 'جانب المدعي', 'Claimant side'),
      item('defendant', 'جانب المدعى عليه', 'Defendant side'),
      item('neutral', 'محايد', 'Neutral'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'hearing_status',
    nameAr: 'حالة الجلسة',
    nameEn: 'Hearing status',
    items: [
      item('scheduled', 'محددة', 'Scheduled'),
      item('held', 'منعقدة', 'Held'),
      item('postponed', 'مؤجلة', 'Postponed'),
      item('cancelled', 'ملغاة', 'Cancelled'),
    ],
  },
  {
    code: 'hearing_purpose',
    nameAr: 'غرض الجلسة',
    nameEn: 'Hearing purpose',
    items: [
      item('first_hearing', 'أول جلسة', 'First hearing'),
      item('pleading', 'مرافعة', 'Pleading'),
      item('evidence', 'إثبات', 'Evidence'),
      item('expert', 'خبرة', 'Expert'),
      item('judgment', 'حكم', 'Judgment'),
      item('procedural', 'إجرائي', 'Procedural'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'judgment_type',
    nameAr: 'نوع الحكم',
    nameEn: 'Judgment type',
    items: [
      item('preliminary', 'تمهيدي', 'Preliminary'),
      item('final', 'نهائي', 'Final'),
      item('interlocutory', 'غير منهٍ للخصومة', 'Interlocutory'),
      item('default', 'غيابي', 'Default'),
      item('consent', 'رضائي', 'Consent'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'judgment_status',
    nameAr: 'حالة الحكم',
    nameEn: 'Judgment status',
    items: [
      item('issued', 'صادر', 'Issued'),
      item('deposited', 'مودع', 'Deposited'),
      item('appealed', 'مطعون عليه', 'Appealed'),
      item('final', 'نهائي', 'Final'),
      item('executed', 'منفذ', 'Executed'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'appeal_type',
    nameAr: 'طريق الطعن',
    nameEn: 'Appeal type',
    items: [
      item('appeal', 'استئناف', 'Appeal'),
      item('cassation', 'طعن بالنقض', 'Cassation'),
      item('opposition', 'معارضة', 'Opposition'),
      item('grievance', 'تظلم', 'Grievance'),
      item('retrial', 'التماس إعادة النظر', 'Retrial'),
      item('constitutional_challenge', 'دفع بعدم الدستورية', 'Constitutional challenge'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'appeal_status',
    nameAr: 'حالة الطعن',
    nameEn: 'Appeal status',
    items: [
      item('pending', 'قيد الإعداد', 'Pending'),
      item('filed', 'مقيد', 'Filed'),
      item('decided', 'محسوم', 'Decided'),
      item('withdrawn', 'متنازل عنه', 'Withdrawn'),
    ],
  },
  {
    code: 'task_type',
    nameAr: 'نوع التكليف أو العمل',
    nameEn: 'Task type',
    items: [
      item('administrative', 'عمل إداري', 'Administrative'),
      item('announcement', 'إعلان', 'Announcement'),
      item('service_of_process', 'أعمال محضرين', 'Service of process'),
      item('document_request', 'طلب صور أو شهادات', 'Document request'),
      item('expert', 'أعمال خبراء', 'Expert work'),
      item('execution', 'إجراء تنفيذ', 'Execution'),
      item('follow_up', 'متابعة', 'Follow-up'),
      item('meeting', 'مقابلة', 'Meeting'),
      item('filing', 'قيد أو تسجيل', 'Filing'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'task_status',
    nameAr: 'حالة التكليف',
    nameEn: 'Task status',
    items: [
      item('open', 'مفتوح', 'Open'),
      item('in_progress', 'جارٍ', 'In progress'),
      item('waiting', 'منتظر', 'Waiting'),
      item('blocked', 'معلق', 'Blocked'),
      item('completed', 'منجز', 'Completed'),
      item('cancelled', 'ملغى', 'Cancelled'),
    ],
  },
  {
    code: 'announcement_kind',
    nameAr: 'نوع الإعلان',
    nameEn: 'Announcement kind',
    items: [
      item('initial', 'إعلان أول', 'Initial service'),
      item('renewal', 'إعادة إعلان', 'Renewal'),
      item('warning', 'إنذار', 'Warning'),
      item('notification', 'إخطار', 'Notification'),
      item('publication', 'نشر', 'Publication'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'announcement_method',
    nameAr: 'طريقة الإعلان',
    nameEn: 'Announcement method',
    items: [
      item('bailiff', 'محضر', 'Bailiff'),
      item('registered_mail', 'بريد مسجل', 'Registered mail'),
      item('publication', 'نشر بالصحف', 'Publication'),
      item('email', 'بريد إلكتروني', 'Email'),
      item('in_person', 'تسليم شخصي', 'In person'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'announcement_status',
    nameAr: 'حالة الإعلان',
    nameEn: 'Announcement status',
    items: [
      item('pending', 'معلق', 'Pending'),
      item('served', 'تم الإعلان', 'Served'),
      item('failed', 'تعذر الإعلان', 'Failed'),
      item('cancelled', 'ملغي', 'Cancelled'),
    ],
  },
  {
    code: 'document_type',
    nameAr: 'نوع المستند',
    nameEn: 'Document type',
    items: [
      item('pleading', 'مذكرة أو صحيفة', 'Pleading'),
      item('judgment', 'حكم', 'Judgment'),
      item('contract', 'عقد', 'Contract'),
      item('poa', 'توكيل', 'Power of attorney'),
      item('power', 'تفويض', 'Authorization'),
      item('evidence', 'مستند إثبات', 'Evidence'),
      item('correspondence', 'مراسلة', 'Correspondence'),
      item('receipt', 'إيصال', 'Receipt'),
      item('id_document', 'إثبات هوية', 'Identity document'),
      item('expert_report', 'تقرير خبير', 'Expert report'),
      item('announcement', 'إعلان', 'Announcement'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'document_status',
    nameAr: 'حالة المستند',
    nameEn: 'Document status',
    items: [
      item('draft', 'مسودة', 'Draft'),
      item('final', 'نهائي', 'Final'),
      item('archived', 'مؤرشف', 'Archived'),
      item('superseded', 'مستبدل', 'Superseded'),
    ],
  },
  {
    code: 'storage_kind',
    nameAr: 'نوع مكان الحفظ',
    nameEn: 'Storage kind',
    items: [
      item('local_file', 'ملف محلي', 'Local file'),
      item('external_reference', 'مرجع خارجي', 'External reference'),
      item('paper', 'ورقي', 'Paper'),
    ],
  },
  {
    code: 'document_content_state',
    nameAr: 'حالة المحتوى الإلكتروني',
    nameEn: 'Document content state',
    items: [
      item('not_digitized', 'ورقي غير رقمي', 'Not digitized'),
      item('referenced', 'مرجع خارجي فقط', 'External reference only'),
      item('pending', 'بانتظار الحفظ', 'Pending storage'),
      item('stored', 'محفوظ', 'Stored'),
      item('failed', 'فشل الحفظ', 'Storage failed'),
    ],
  },
  {
    code: 'document_storage_state',
    nameAr: 'حالة حفظ نسخة المستند',
    nameEn: 'Document storage state',
    items: [
      item('registered', 'مسجل فقط', 'Registered only'),
      item('stored', 'محفوظ', 'Stored'),
      item('verified', 'تم التحقق', 'Verified'),
      item('missing', 'مفقود', 'Missing'),
      item('failed', 'فشل', 'Failed'),
    ],
  },
  {
    code: 'contract_type',
    nameAr: 'نوع العقد',
    nameEn: 'Contract type',
    items: [
      item('retainer', 'أتعاب دورية', 'Retainer'),
      item('hourly', 'أتعاب بالساعة', 'Hourly'),
      item('success_fee', 'أتعاب نجاح', 'Success fee'),
      item('fixed_fee', 'أتعاب ثابتة', 'Fixed fee'),
      item('consultation', 'استشارة', 'Consultation'),
      item('service', 'خدمة', 'Service'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'contract_status',
    nameAr: 'حالة العقد',
    nameEn: 'Contract status',
    items: [
      item('draft', 'مسودة', 'Draft'),
      item('active', 'ساري', 'Active'),
      item('expired', 'منتهي', 'Expired'),
      item('terminated', 'مفسوخ', 'Terminated'),
      item('completed', 'مكتمل', 'Completed'),
    ],
  },
  {
    code: 'contract_party_role',
    nameAr: 'صفة الطرف في العقد',
    nameEn: 'Contract party role',
    items: [
      item('client', 'موكل', 'Client'),
      item('lawyer', 'محامٍ', 'Lawyer'),
      item('witness', 'شاهد', 'Witness'),
      item('guarantor', 'ضامن', 'Guarantor'),
      item('representative', 'ممثل', 'Representative'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'instrument_kind',
    nameAr: 'نوع المحرر',
    nameEn: 'Instrument kind',
    items: [
      item('power_of_attorney', 'توكيل', 'Power of attorney'),
      item('delegation', 'تفويض', 'Delegation'),
      item('authorization', 'تخويل', 'Authorization'),
    ],
  },
  {
    code: 'poa_status',
    nameAr: 'حالة التوكيل',
    nameEn: 'POA status',
    items: [
      item('active', 'ساري', 'Active'),
      item('expired', 'منتهي', 'Expired'),
      item('revoked', 'ملغي', 'Revoked'),
      item('suspended', 'موقوف', 'Suspended'),
    ],
  },
  {
    code: 'fee_agreement_type',
    nameAr: 'نوع الاتفاق المالي',
    nameEn: 'Fee agreement type',
    items: [
      item('fixed', 'أتعاب ثابتة', 'Fixed fee'),
      item('hourly', 'أتعاب بالساعة', 'Hourly'),
      item('retainer', 'أتعاب دورية', 'Retainer'),
      item('success', 'أتعاب نجاح', 'Success fee'),
      item('mixed', 'مختلط', 'Mixed'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'fee_agreement_status',
    nameAr: 'حالة الاتفاق المالي',
    nameEn: 'Fee agreement status',
    items: [
      item('draft', 'مسودة', 'Draft'),
      item('active', 'ساري', 'Active'),
      item('completed', 'مكتمل', 'Completed'),
      item('cancelled', 'ملغي', 'Cancelled'),
    ],
  },
  {
    code: 'charge_type',
    nameAr: 'نوع المستحق',
    nameEn: 'Charge type',
    items: [
      item('fee', 'أتعاب', 'Fee'),
      item('fee_installment', 'قسط أتعاب', 'Fee installment'),
      item('expense', 'مصروف', 'Expense'),
      item('disbursement', 'نفقات مدفوعة', 'Disbursement'),
      item('court_fee', 'رسوم قضائية', 'Court fee'),
      item('expert_fee', 'أتعاب خبير', 'Expert fee'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'charge_status',
    nameAr: 'حالة المستحق',
    nameEn: 'Charge status',
    items: [
      item('outstanding', 'مستحق', 'Outstanding'),
      item('partially_paid', 'مسدد جزئيًا', 'Partially paid'),
      item('paid', 'مسدد', 'Paid'),
      item('cancelled', 'ملغي', 'Cancelled'),
    ],
  },
  {
    code: 'transaction_type',
    nameAr: 'نوع الحركة المالية',
    nameEn: 'Transaction type',
    items: [
      item('fee_payment', 'سداد أتعاب', 'Fee payment'),
      item('expense_reimbursement', 'رد مصروفات', 'Expense reimbursement'),
      item('court_fee', 'رسوم قضائية', 'Court fee'),
      item('expert_fee', 'أتعاب خبير', 'Expert fee'),
      item('advance', 'سلفة', 'Advance'),
      item('refund', 'رد مبلغ', 'Refund'),
      item('deposit', 'إيداع', 'Deposit'),
      item('withdrawal', 'سحب', 'Withdrawal'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'payment_method',
    nameAr: 'طريقة الدفع',
    nameEn: 'Payment method',
    items: [
      item('cash', 'نقدي', 'Cash'),
      item('bank_transfer', 'تحويل بنكي', 'Bank transfer'),
      item('cheque', 'شيك', 'Cheque'),
      item('card', 'بطاقة', 'Card'),
      item('online_wallet', 'محفظة إلكترونية', 'Online wallet'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'transaction_category',
    nameAr: 'تصنيف الحركة المالية',
    nameEn: 'Transaction category',
    items: [
      item('fee', 'أتعاب', 'Fee'),
      item('expense', 'مصروف', 'Expense'),
      item('office', 'مصروف مكتب', 'Office expense'),
      item('court', 'محكمة', 'Court'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'account_kind',
    nameAr: 'نوع الحساب المالي',
    nameEn: 'Account kind',
    items: [
      item('cash', 'خزينة نقدية', 'Cash'),
      item('bank', 'حساب بنكي', 'Bank account'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'appointment_kind',
    nameAr: 'نوع الموعد',
    nameEn: 'Appointment kind',
    items: [
      item('meeting', 'مقابلة', 'Meeting'),
      item('call', 'مكالمة', 'Call'),
      item('court_visit', 'زيارة محكمة', 'Court visit'),
      item('administrative', 'عمل إداري', 'Administrative'),
      item('personal', 'شخصي', 'Personal'),
      item('other', 'أخرى', 'Other'),
    ],
  },
  {
    code: 'appointment_status',
    nameAr: 'حالة الموعد',
    nameEn: 'Appointment status',
    items: [
      item('scheduled', 'محدد', 'Scheduled'),
      item('completed', 'منجز', 'Completed'),
      item('cancelled', 'ملغي', 'Cancelled'),
      item('no_show', 'لم يحضر', 'No show'),
    ],
  },
  {
    code: 'governorate',
    nameAr: 'المحافظة',
    nameEn: 'Governorate',
    items: [
      item('cairo', 'القاهرة', 'Cairo'),
      item('giza', 'الجيزة', 'Giza'),
      item('alexandria', 'الإسكندرية', 'Alexandria'),
      item('qalyubia', 'القليوبية', 'Qalyubia'),
      item('dakahlia', 'الدقهلية', 'Dakahlia'),
      item('sharqia', 'الشرقية', 'Sharqia'),
      item('gharbia', 'الغربية', 'Gharbia'),
      item('monufia', 'المنوفية', 'Monufia'),
      item('beheira', 'البحيرة', 'Beheira'),
      item('kafr_el_sheikh', 'كفر الشيخ', 'Kafr El Sheikh'),
      item('damietta', 'دمياط', 'Damietta'),
      item('port_said', 'بورسعيد', 'Port Said'),
      item('ismailia', 'الإسماعيلية', 'Ismailia'),
      item('suez', 'السويس', 'Suez'),
      item('north_sinai', 'شمال سيناء', 'North Sinai'),
      item('south_sinai', 'جنوب سيناء', 'South Sinai'),
      item('fayoum', 'الفيوم', 'Fayoum'),
      item('beni_suef', 'بني سويف', 'Beni Suef'),
      item('minya', 'المنيا', 'Minya'),
      item('asyut', 'أسيوط', 'Asyut'),
      item('sohag', 'سوهاج', 'Sohag'),
      item('qena', 'قنا', 'Qena'),
      item('luxor', 'الأقصر', 'Luxor'),
      item('aswan', 'أسوان', 'Aswan'),
      item('red_sea', 'البحر الأحمر', 'Red Sea'),
      item('new_valley', 'الوادي الجديد', 'New Valley'),
      item('matrouh', 'مطروح', 'Matrouh'),
    ],
  },
];

export interface SeedSetting {
  readonly key: string;
  readonly value: string;
  readonly valueType: 'string' | 'number' | 'boolean' | 'json';
  readonly descriptionAr: string;
}

/**
 * Shared office settings. They are synced because they describe how the office
 * works, not how one screen looks. Per-device preferences live in
 * `device_setting` and are never synced.
 */
export const SEED_OFFICE_SETTINGS: readonly SeedSetting[] = [
  { key: 'locale.language', value: 'ar', valueType: 'string', descriptionAr: 'لغة الواجهة الافتراضية' },
  { key: 'locale.direction', value: 'rtl', valueType: 'string', descriptionAr: 'اتجاه الواجهة' },
  { key: 'locale.timezone', value: 'Africa/Cairo', valueType: 'string', descriptionAr: 'المنطقة الزمنية الافتراضية' },
  { key: 'locale.date_format', value: 'dd/MM/yyyy', valueType: 'string', descriptionAr: 'تنسيق عرض التاريخ' },
  { key: 'locale.week_start', value: 'saturday', valueType: 'string', descriptionAr: 'أول أيام الأسبوع' },
  { key: 'locale.calendar', value: 'gregorian', valueType: 'string', descriptionAr: 'التقويم المستخدم في العرض' },
  { key: 'finance.default_currency', value: 'EGP', valueType: 'string', descriptionAr: 'العملة الافتراضية' },
  { key: 'finance.receipt_on_payment', value: 'true', valueType: 'boolean', descriptionAr: 'إنشاء رقم إيصال تلقائي للمدفوعات' },
  { key: 'numbering.file.strategy', value: 'device_scoped', valueType: 'string', descriptionAr: 'استراتيجية ترقيم الملفات' },
  { key: 'appointments.default_duration_minutes', value: '30', valueType: 'number', descriptionAr: 'المدة الافتراضية للموعد' },
  { key: 'backup.reminder_days', value: '7', valueType: 'number', descriptionAr: 'فترة التذكير بالنسخ الاحتياطي' },
];

export interface SeedCurrency {
  readonly code: string;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly symbol: string;
  readonly minorUnits: number;
}

export const SEED_CURRENCIES: readonly SeedCurrency[] = [
  { code: 'EGP', nameAr: 'جنيه مصري', nameEn: 'Egyptian pound', symbol: 'ج.م', minorUnits: 2 },
  { code: 'USD', nameAr: 'دولار أمريكي', nameEn: 'US dollar', symbol: 'US$', minorUnits: 2 },
  { code: 'EUR', nameAr: 'يورو', nameEn: 'Euro', symbol: '€', minorUnits: 2 },
  { code: 'GBP', nameAr: 'جنيه إسترليني', nameEn: 'Pound sterling', symbol: '£', minorUnits: 2 },
  { code: 'SAR', nameAr: 'ريال سعودي', nameEn: 'Saudi riyal', symbol: 'ر.س', minorUnits: 2 },
  { code: 'AED', nameAr: 'درهم إماراتي', nameEn: 'UAE dirham', symbol: 'د.إ', minorUnits: 2 },
];

export interface SeedNumberSeries {
  readonly key: string;
  readonly scope: string;
  readonly format: string;
  readonly padding: number;
  readonly nextValue: number;
}

/**
 * Visible numbers are display-only. They are issued per device (`{device}`)
 * by default so that two offline devices cannot mint the same file number.
 * See docs/decisions.md and NumberSeriesService.
 */
export const SEED_NUMBER_SERIES: readonly SeedNumberSeries[] = [
  { key: 'file.number', scope: '', format: 'FILE-{device}-{year}-{value}', padding: 4, nextValue: 1 },
  { key: 'client.code', scope: '', format: 'CLI-{device}-{year}-{value}', padding: 4, nextValue: 1 },
  { key: 'receipt.number', scope: '', format: 'RCPT-{device}-{year}-{value}', padding: 5, nextValue: 1 },
  { key: 'contract.number', scope: '', format: 'CON-{device}-{year}-{value}', padding: 4, nextValue: 1 },
  { key: 'poa.number', scope: '', format: 'POA-{device}-{year}-{value}', padding: 4, nextValue: 1 },
];

export const SYSTEM_DEVICE_SEED = {
  label: 'النظام',
  platform: 'system',
  shortCode: 'SYSTEM',
  timezone: 'Africa/Cairo',
} as const;

export const OFFICE_PROFILE_SEED = {
  name: 'مكتب المحاماة',
  isConfigured: 0,
} as const;
