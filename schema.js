// Everything the admin panel can edit is described here.
// The server builds tables, validation and forms from these definitions.
// Field types: text, textarea, number, bool, select, date, image, images, tags, lines, color

const SETTINGS = [
  { group: 'Business', fields: [
    { key: 'business_name', label: 'Venue name', type: 'text', default: 'Gul Makkai Palace' },
    { key: 'tagline', label: 'Tagline', type: 'text', default: '& Arena · Weddings and Events' },
    { key: 'phone', label: 'Phone (shown on site)', type: 'text', default: '+92 322 9022097' },
    { key: 'phone2', label: 'Second phone', type: 'text', default: '+92 336 8544663' },
    { key: 'whatsapp', label: 'WhatsApp number', type: 'text', default: '', hint: 'Country code, digits only, e.g. 923229022097. Turns on WhatsApp buttons.' },
    { key: 'email', label: 'Email', type: 'text', default: '' },
    { key: 'address', label: 'Address', type: 'textarea', default: 'Motorway Service Road, Northern Bypass, near H Chowk, Overseas Pakistan Foundation Colony, Peshawar' },
    { key: 'map_lat', label: 'Map latitude', type: 'text', default: '34.0270158' },
    { key: 'map_lng', label: 'Map longitude', type: 'text', default: '71.6397462' },
    { key: 'currency', label: 'Currency label', type: 'text', default: 'Rs' },
  ]},
  { group: 'Homepage', fields: [
    { key: 'announcement', label: 'Top banner (blank = hidden)', type: 'text', default: '' },
    { key: 'hero_title', label: 'Headline', type: 'text', default: 'Where Peshawar celebrates.' },
    { key: 'hero_subtitle', label: 'Sub-headline', type: 'textarea', default: 'A grand hall for 2,000+ guests, a huge private car park and menus made for big families — on the Northern Bypass, away from city traffic.' },
    { key: 'hero_images', label: 'Homepage photos (slideshow)', type: 'images', default: '[]' },
    { key: 'logo', label: 'Logo', type: 'image', default: '' },
    { key: 'about_title', label: 'About heading', type: 'text', default: 'Space for every guest. Parking for every car.' },
    { key: 'about_text', label: 'About text', type: 'textarea', default: 'Gul Makkai Palace & Arena sits on the Motorway Service Road at the Northern Bypass, so your guests skip the city rush. Our main hall seats more than 2,000 guests, and our private car park takes the stress out of arrivals. We host baraat, walima, mehndi and engagement functions, as well as corporate, community and political gatherings.' },
    { key: 'facilities', label: 'Facilities list', type: 'lines', default: '2,000+ guest capacity\nLarge private car park\nAir-conditioned hall\nStage and lighting\nIn-house catering\nSeparate family arrangements\nBackup generator\nEasy motorway access' },
  ]},
  { group: 'Bookings', fields: [
    { key: 'slots', label: 'Time slots', type: 'lines', default: 'Lunch|12:00|16:00\nDinner|19:00|23:00', hint: 'One per line as  Name|start|end' },
    { key: 'event_types', label: 'Event types', type: 'tags', default: 'Baraat, Walima, Mehndi, Engagement, Birthday, Corporate event, Political gathering, Exam / seminar, Other' },
    { key: 'booking_days_ahead', label: 'How far ahead customers can request (days)', type: 'number', default: '365' },
    { key: 'advance_percent', label: 'Advance required to confirm (%)', type: 'number', default: '25' },
    { key: 'closed_dates', label: 'Closed dates', type: 'tags', default: '', hint: 'Comma separated YYYY-MM-DD' },
    { key: 'booking_enabled', label: 'Accept booking requests online', type: 'bool', default: '1' },
  ]},
  { group: 'Receipts', fields: [
    { key: 'receipt_terms', label: 'Terms printed on booking receipts', type: 'lines', default: 'Please keep this receipt and bring it on the day of your event.\nThe remaining balance is payable before the event.', hint: 'One per line. Edit to match your own policy (cancellations, changes, refunds).' },
    { key: 'receipt_manager_label', label: 'Manager signature label', type: 'text', default: 'Manager / Authorised signature' },
  ]},
  { group: 'Look & links', fields: [
    { key: 'primary_color', label: 'Main colour', type: 'color', default: '#0f3b2f' },
    { key: 'accent_color', label: 'Gold colour', type: 'color', default: '#c9a45c' },
    { key: 'facebook', label: 'Facebook URL', type: 'text', default: '' },
    { key: 'instagram', label: 'Instagram URL', type: 'text', default: '' },
    { key: 'tiktok', label: 'TikTok URL', type: 'text', default: '' },
  ]},
];

// Content and record tables managed with the generic editor in the admin panel
const TABLES = {
  halls: {
    label: 'Halls', singular: 'hall', titleField: 'name', subField: 'capacity', public: true, order: 'sort, id',
    fields: [
      { key: 'name', label: 'Hall name', type: 'text', required: true },
      { key: 'capacity', label: 'Maximum guests', type: 'number' },
      { key: 'min_guests', label: 'Minimum guests', type: 'number' },
      { key: 'hire_charge', label: 'Hall charge without a package', type: 'number', hint: 'Used when a customer books the hall only' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'facilities', label: 'Features', type: 'tags', hint: 'Comma separated' },
      { key: 'images', label: 'Photos', type: 'images' },
      { key: 'sort', label: 'Display order', type: 'number' },
      { key: 'active', label: 'Show on website and accept bookings', type: 'bool', default: true },
    ],
  },
  packages: {
    label: 'Packages & menus', singular: 'package', titleField: 'name', subField: 'per_head', public: true, order: 'sort, id',
    fields: [
      { key: 'name', label: 'Package name', type: 'text', required: true },
      { key: 'per_head', label: 'Price per head', type: 'number', required: true },
      { key: 'min_guests', label: 'Minimum guests', type: 'number' },
      { key: 'description', label: 'Short description', type: 'textarea' },
      { key: 'items', label: 'Menu items', type: 'lines', hint: 'One dish per line. These fill the menu on each booking, where admins can swap dishes.' },
      { key: 'highlight', label: 'Highlight as most popular', type: 'bool' },
      { key: 'sort', label: 'Display order', type: 'number' },
      { key: 'active', label: 'Show on website', type: 'bool', default: true },
    ],
  },
  addons: {
    label: 'Add-ons & extras', singular: 'add-on', titleField: 'name', subField: 'price', public: true, order: 'sort, id',
    fields: [
      { key: 'name', label: 'Add-on name', type: 'text', required: true, hint: 'e.g. DJ & sound system' },
      { key: 'price', label: 'Price', type: 'number', hint: 'Leave blank for "price on request"' },
      { key: 'price_type', label: 'Charged', type: 'select', options: ['per event', 'per head'], default: 'per event' },
      { key: 'description', label: 'Short description', type: 'textarea' },
      { key: 'sort', label: 'Display order', type: 'number' },
      { key: 'active', label: 'Show on website', type: 'bool', default: true },
    ],
  },
  dishes: {
    label: 'Menu dishes', singular: 'dish', titleField: 'name', subField: 'course', public: false, order: 'course, sort, name',
    fields: [
      { key: 'name', label: 'Dish name', type: 'text', required: true, hint: 'e.g. Mutton Qorma' },
      { key: 'course', label: 'Course', type: 'select', options: ['Rice', 'Main course', 'BBQ', 'Starters', 'Bread', 'Salad & raita', 'Dessert', 'Drinks', 'Other'], default: 'Main course' },
      { key: 'price', label: 'Usual extra charge', type: 'number', hint: 'Added on top of the package when a customer swaps to this dish. Blank or 0 = no extra. Admins can change it on each booking.' },
      { key: 'price_type', label: 'Charged', type: 'select', options: ['per head', 'per event'], default: 'per head' },
      { key: 'sort', label: 'Display order', type: 'number' },
      { key: 'active', label: 'Show in the dish list', type: 'bool', default: true },
    ],
  },
  offers: {
    label: 'Offers', singular: 'offer', titleField: 'title', subField: 'valid_until', public: true, order: 'id DESC',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'badge', label: 'Badge', type: 'text', hint: 'e.g. 10% OFF' },
      { key: 'image', label: 'Image', type: 'image' },
      { key: 'valid_until', label: 'Valid until', type: 'date' },
      { key: 'active', label: 'Show on website', type: 'bool', default: true },
    ],
  },
  reviews: {
    label: 'Reviews', singular: 'review', titleField: 'name', subField: 'event', public: true, order: 'sort, id DESC',
    fields: [
      { key: 'name', label: 'Customer name', type: 'text', required: true },
      { key: 'event', label: 'Event', type: 'text', hint: 'e.g. Walima, March 2026' },
      { key: 'quote', label: 'What they said', type: 'textarea', required: true },
      { key: 'rating', label: 'Stars (1–5)', type: 'number', default: 5 },
      { key: 'sort', label: 'Display order', type: 'number' },
      { key: 'active', label: 'Show on website', type: 'bool', default: true },
    ],
  },
  employees: {
    label: 'Employees', singular: 'employee', titleField: 'name', subField: 'role', public: false, order: "status = 'left', name",
    fields: [
      { key: 'name', label: 'Full name', type: 'text', required: true },
      { key: 'role', label: 'Role', type: 'text', hint: 'e.g. Manager, Waiter, Cook, Guard, Cleaner' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'cnic', label: 'CNIC number', type: 'text' },
      { key: 'salary', label: 'Monthly salary', type: 'number' },
      { key: 'join_date', label: 'Joining date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['active', 'left'], default: 'active' },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'emergency_contact', label: 'Emergency contact', type: 'text', hint: 'Name and phone' },
      { key: 'photo', label: 'Photo', type: 'image' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
};

// What a non-owner admin can be allowed to do. The owner (grand admin) always has everything.
const PERMISSIONS = [
  { key: 'bookings', label: 'Bookings & calendar', hint: 'See bookings, add new ones as requests, edit details' },
  { key: 'confirm', label: 'Confirm bookings', hint: 'Confirm requests and mark events completed' },
  { key: 'cancel', label: 'Cancel bookings', hint: 'Cancel a booking and free up the date' },
  { key: 'payments', label: 'Booking payments', hint: 'Record advance and balance payments' },
  { key: 'cashflow', label: 'Cashflow', hint: 'See money in and out, add income and expenses' },
  { key: 'payroll', label: 'Payroll', hint: 'Pay salaries' },
  { key: 'employees', label: 'Employee records', hint: 'Add and edit staff details and salaries' },
  { key: 'website', label: 'Website content', hint: 'Halls, packages, offers, gallery, reviews' },
  { key: 'settings', label: 'Settings', hint: 'Venue details, time slots, prices rules, colours' },
  { key: 'delete', label: 'Delete records', hint: 'Delete bookings, payments and cashflow entries' },
];

const INCOME_CATEGORIES = ['Booking payment', 'Hall rent', 'Catering', 'Decoration', 'Parking', 'Other income'];
const EXPENSE_CATEGORIES = ['Salaries', 'Food supplies', 'Electricity', 'Gas', 'Generator fuel', 'Decoration', 'Maintenance & repairs', 'Cleaning', 'Rent', 'Marketing', 'Equipment', 'Taxes & fees', 'Other expense'];
// What a booking payment can be for (add-on names of the booking are offered too)
const PAYMENT_PURPOSES = ['Advance', 'Part payment', 'Remaining balance', 'Full payment', 'Special arrangement', 'Other'];
const PAY_METHODS = ['Cash', 'Bank transfer', 'JazzCash', 'Easypaisa', 'Cheque'];

// First-run content. Prices are placeholders for the owner to change.
const SEED = {
  halls: [
    { name: 'Main Hall', capacity: 2000, min_guests: 300, hire_charge: 0, sort: 1, active: true,
      description: 'Our grand hall with a wide stage and room for more than 2,000 guests.',
      facilities: ['Air-conditioned', 'Stage & lighting', 'Separate family seating', 'Sound system'], images: [] },
  ],
  packages: [
    { name: 'Classic', per_head: 1500, min_guests: 300, sort: 1, active: true, description: 'A traditional menu for any function.',
      items: ['Chicken Qorma', 'Chicken Pulao', 'Naan / Roti', 'Raita & Salad', 'Kheer', 'Cold drinks', 'Mineral water'] },
    { name: 'Royal', per_head: 2200, min_guests: 300, sort: 2, active: true, highlight: true, description: 'Our most popular wedding menu.',
      items: ['Chicken Karahi', 'Mutton Pulao', 'Chicken Tikka', 'Naan / Roti', 'Raita & Salad', 'Firni', 'Cold drinks', 'Mineral water', 'Green tea'] },
    { name: 'Grand', per_head: 3000, min_guests: 300, sort: 3, active: true, description: 'A full spread for the big day.',
      items: ['Mutton Karahi', 'Kabuli Pulao', 'Chicken Tikka & Seekh Kebab', 'Chapli Kebab', 'Naan / Roti', 'Raita & Salad', 'Firni & Gajar Halwa', 'Cold drinks', 'Mineral water', 'Kahwa'] },
  ],
  // Prices left blank on purpose: the owner sets them (blank shows as "price on request")
  addons: [
    { name: 'DJ & sound system', price_type: 'per event', sort: 1, active: true, description: 'DJ with speakers and microphones for the evening.' },
    { name: 'Stage decor', price_type: 'per event', sort: 2, active: true, description: 'Decorated stage for the couple, with sofa and backdrop.' },
    { name: 'Flower decoration', price_type: 'per event', sort: 3, active: true, description: 'Fresh flowers for the stage, entrance and tables.' },
    { name: 'Special lighting', price_type: 'per event', sort: 4, active: true, description: 'Fairy lights, spotlights and entrance lighting.' },
    { name: 'Separate family arrangement', price_type: 'per event', sort: 5, active: true, description: 'Partitioned family seating area.' },
  ],
  // Extra charges are placeholders for the owner to change
  dishes: [
    ...['Chicken Pulao', 'Chicken Biryani'].map(name => ({ name, course: 'Rice', active: true })),
    { name: 'Kabuli Pulao', course: 'Rice', price: 150, price_type: 'per head', active: true },
    { name: 'Mutton Pulao', course: 'Rice', price: 300, price_type: 'per head', active: true },
    ...['Chicken Qorma', 'Chicken Karahi', 'Chicken White Handi', 'Daal / Mix Sabzi'].map(name => ({ name, course: 'Main course', active: true })),
    { name: 'Mutton Qorma', course: 'Main course', price: 300, price_type: 'per head', active: true },
    { name: 'Mutton Karahi', course: 'Main course', price: 350, price_type: 'per head', active: true },
    ...['Chicken Tikka', 'Seekh Kebab'].map(name => ({ name, course: 'BBQ', active: true })),
    { name: 'Chapli Kebab', course: 'BBQ', price: 150, price_type: 'per head', active: true },
    { name: 'Malai Boti', course: 'BBQ', price: 120, price_type: 'per head', active: true },
    ...['Kheer', 'Firni', 'Gajar Halwa'].map(name => ({ name, course: 'Dessert', active: true })),
    { name: 'Ice cream', course: 'Dessert', price: 80, price_type: 'per head', active: true },
    ...['Cold drinks', 'Mineral water', 'Green tea', 'Kahwa'].map(name => ({ name, course: 'Drinks', active: true })),
  ],
  offers: [],
  reviews: [],
  employees: [],
};

module.exports = { SETTINGS, TABLES, SEED, PERMISSIONS, INCOME_CATEGORIES, EXPENSE_CATEGORIES, PAY_METHODS, PAYMENT_PURPOSES };
