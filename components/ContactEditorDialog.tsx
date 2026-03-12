import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, MapPin, Phone, X } from 'lucide-react';
import { useAccounting } from '../contexts/AccountingContext';
import { Contact, ContactPreferredPriceTier, ContactType } from '../types';
import ResponsiveDialog from './layout/ResponsiveDialog';
import { getDisplayAccountName } from '../utils/displayNames';

type ContactEditorDialogProps = {
  onClose: () => void;
  onSave?: (contact: Contact) => void;
  contact?: Contact | null;
  initialName?: string;
  initialType?: ContactType;
  allowedTypes?: ContactType[];
  mode?: 'INVOICE' | 'DIRECTORY';
};

const ContactEditorDialog: React.FC<ContactEditorDialogProps> = ({
  onClose,
  onSave,
  contact,
  initialName = '',
  initialType = 'CUSTOMER',
  allowedTypes = ['CUSTOMER', 'SUPPLIER', 'PARTNER'],
  mode = 'DIRECTORY'
}) => {
  const { addContact, updateContact, accounts, companySettings } = useAccounting();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<ContactType>(initialType);
  const [preferredPriceTier, setPreferredPriceTier] = useState<ContactPreferredPriceTier>(initialType === 'SUPPLIER' ? 'WHOLESALE' : 'RETAIL');

  const isEnglish = (companySettings.language ?? 'AR') !== 'AR';
  const tr = (ar: string, en: string) => (isEnglish ? en : ar);
  const displayAccountName = (account?: { id: string; name: string } | null) =>
    getDisplayAccountName(account || undefined, isEnglish);

  useEffect(() => {
    if (contact) {
      setName(contact.name || '');
      setPhone(contact.phone || '');
      setAddress(contact.address || '');
      setType(contact.type);
      setPreferredPriceTier(contact.preferredPriceTier || (contact.type === 'SUPPLIER' ? 'WHOLESALE' : 'RETAIL'));
      return;
    }
    setName(initialName);
    setPhone('');
    setAddress('');
    setType(initialType);
    setPreferredPriceTier(initialType === 'SUPPLIER' ? 'WHOLESALE' : 'RETAIL');
  }, [contact, initialName, initialType]);

  const visibleTypes = useMemo(
    () => allowedTypes.filter((value, index, self) => self.indexOf(value) === index),
    [allowedTypes]
  );

  const title = (() => {
    if (mode === 'INVOICE') {
      return type === 'SUPPLIER'
        ? tr('إضافة مورد جديد', 'Add New Supplier')
        : tr('إضافة عميل جديد', 'Add New Customer');
    }
    return contact
      ? tr('تعديل بيانات الطرف', 'Edit Contact')
      : tr('إضافة طرف جديد', 'Add New Contact');
  })();

  const submitLabel = mode === 'INVOICE'
    ? tr('حفظ الطرف واختياره في الفاتورة', 'Save Contact And Select It In Invoice')
    : contact
      ? tr('حفظ التعديلات', 'Save Changes')
      : tr('إضافة للقائمة', 'Add to List');

  const typeLabel = (value: ContactType) => {
    if (value === 'CUSTOMER') return tr('عميل', 'Customer');
    if (value === 'SUPPLIER') return tr('مورد', 'Supplier');
    if (value === 'PARTNER') return tr('شريك', 'Partner');
    return tr('موظف', 'Employee');
  };

  const typeButtonClass = (value: ContactType) => {
    const active = type === value;
    if (!active) return 'text-gray-400';
    if (value === 'CUSTOMER') return 'bg-white shadow text-blue-600';
    if (value === 'SUPPLIER') return 'bg-white shadow text-orange-600';
    if (value === 'PARTNER') return 'bg-white shadow text-emerald-600';
    return 'bg-white shadow text-purple-600';
  };

  const showPreferredPricing = type === 'CUSTOMER' || type === 'SUPPLIER';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const payload = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      type,
      preferredPriceTier: showPreferredPricing ? preferredPriceTier : undefined
    };

    if (contact) {
      const result = updateContact(contact.id, payload);
      if (!result.ok) return;
      onSave?.({ ...contact, ...payload });
    } else {
      const id = Math.random().toString(36).slice(2, 11);
      const created: Contact = { id, ...payload };
      const result = addContact(created);
      if (!result.ok) return;
      onSave?.(created);
    }

    onClose();
  };

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      size="md"
      zIndexClassName="z-[300]"
      backdropClassName="bg-black/70 backdrop-blur-md"
      panelClassName="bg-white rounded-[2.5rem] p-8 shadow-2xl"
    >
      <div className="flex justify-between items-center mb-6" dir={isEnglish ? 'ltr' : 'rtl'}>
        <h3 className="font-black text-gray-800 text-lg">{title}</h3>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" dir={isEnglish ? 'ltr' : 'rtl'}>
        {visibleTypes.length > 1 && (
          <div className="flex bg-gray-50 p-1 rounded-2xl mb-2">
            {visibleTypes.map((contactType) => (
              <button
                key={contactType}
                type="button"
                onClick={() => setType(contactType)}
                className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${typeButtonClass(contactType)}`}
              >
                {typeLabel(contactType)}
              </button>
            ))}
          </div>
        )}

        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('الاسم التجاري / الشخصي', 'Contact Name')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 font-bold text-sm outline-none focus:ring-4 ring-blue-50 transition-all"
            placeholder={tr('الاسم...', 'Name...')}
            required
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('رقم الهاتف (اختياري)', 'Phone (optional)')}</label>
          <div className="relative">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 font-bold text-sm outline-none text-right dir-ltr focus:ring-4 ring-blue-50 transition-all"
              placeholder="05xxxxxxxx"
            />
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('العنوان (اختياري)', 'Address (optional)')}</label>
          <div className="relative">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 font-bold text-sm outline-none focus:ring-4 ring-blue-50 transition-all"
              placeholder={tr('المدينة - الحي', 'City - District')}
            />
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
          </div>
        </div>

        {showPreferredPricing && (
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">
              {tr('\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a \u0641\u064a \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629', 'Default Invoice Price')}
            </label>
            <div className="flex bg-gray-50 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setPreferredPriceTier('RETAIL')}
                className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${preferredPriceTier === 'RETAIL' ? 'bg-white shadow text-blue-600' : 'text-gray-400'}`}
              >
                {tr('\u0645\u0641\u0631\u0642', 'Retail')}
              </button>
              <button
                type="button"
                onClick={() => setPreferredPriceTier('WHOLESALE')}
                className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${preferredPriceTier === 'WHOLESALE' ? 'bg-white shadow text-emerald-600' : 'text-gray-400'}`}
              >
                {tr('\u062c\u0645\u0644\u0629', 'Wholesale')}
              </button>
            </div>
            <p className="mt-2 px-1 text-[10px] font-bold text-slate-400">
              {tr('\u0633\u064a\u062a\u0645 \u0627\u0639\u062a\u0645\u0627\u062f \u0647\u0630\u0627 \u0627\u0644\u0633\u0639\u0631 \u062a\u0644\u0642\u0627\u0626\u064a\u064b\u0627 \u0639\u0646\u062f \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0641\u064a \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629.', 'This price tier will be used automatically when adding items in the invoice.')}
            </p>
          </div>
        )}

        {type === 'PARTNER' && (
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 block mb-1.5">{tr('حسابات الشريك', 'Partner Accounts')}</label>
            <div className="w-full p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-[11px] font-black text-emerald-800">
              {tr('سيتم إنشاء حسابات الشريك تلقائيًا، وتُرحّل الحركات اليومية على جاري الشريك، بينما تتم التسوية السنوية بين الجاري ورأس المال.', 'Partner accounts are auto-created. Daily activity is posted to partner current, while year-end settlement is between current and capital.')}
            </div>
            {contact && (contact.currentAccountId || contact.linkedAccountId) && (
              <div className="mt-2 w-full p-3 bg-white rounded-2xl border border-gray-200 text-[11px] font-black text-gray-700">
                {tr('الحساب المرتبط الحالي:', 'Current linked account:')} {displayAccountName(accounts.find(a => a.id === (contact.currentAccountId || contact.linkedAccountId)) || null)}
              </div>
            )}
          </div>
        )}

        <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-[1.8rem] font-black text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 mt-4">
          <CheckCircle2 size={18} />
          {submitLabel}
        </button>
      </form>
    </ResponsiveDialog>
  );
};

export default ContactEditorDialog;
