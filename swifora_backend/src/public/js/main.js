const adminCsrfToken =
  document
    .querySelector(
      'meta[name="csrf-token"]',
    )
    ?.getAttribute('content')
  || '';

const adminActionCapability =
  adminCsrfToken || null;

const nativeFetch =
  window.fetch.bind(window);

function adminFetch(input, init = {}) {
  const requestMethod =
    String(
      init.method
      || (
        input instanceof Request
          ? input.method
          : 'GET'
      ),
    )
      .toUpperCase();

  const mutating =
    ['POST', 'PUT', 'PATCH', 'DELETE']
      .includes(requestMethod);

  if (!mutating) {
    return nativeFetch(
      input,
      init,
    );
  }

  const rawUrl =
    input instanceof Request
      ? input.url
      : input;

  const requestUrl =
    new URL(
      rawUrl,
      window.location.href,
    );

  if (
    requestUrl.origin
    !== window.location.origin
  ) {
    return nativeFetch(
      input,
      init,
    );
  }

  const inheritedHeaders =
    input instanceof Request
      ? input.headers
      : undefined;

  const headers =
    new Headers(
      init.headers
      || inheritedHeaders
      || undefined,
    );

  if (adminCsrfToken) {
    headers.set(
      'X-CSRF-Token',
      adminCsrfToken,
    );
  }

  return nativeFetch(
    input,
    {
      ...init,
      headers,
    },
  );
}

// ================================================
// 1. الساعة الحية
// ================================================
function updateClocks() {
  const now = new Date();
  const str = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  ['clockDisplay', 'clockDisplay2', 'clockDisplay3', 'clockDisplay4', 'clockDisplay5', 'clockDisplay6', 'clockDisplay7', 'clockDisplay8', 'clockDisplay9', 'clockDisplay10', 'clockDisplay11', 'clockDisplay12', 'clockDisplay13', 'clockDisplay14', 'clockDisplay15'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = str;
  });
}
setInterval(updateClocks, 1000);
updateClocks();

// Keep the dashboard order counters current while it is the visible page.
setInterval(() => {
  const dashboard = document.getElementById('page-dashboard');
  if (dashboard && dashboard.classList.contains('active-page')) {
    loadDashboardStats();
  }
}, 30000);

// ================================================
// 2. التنقل بين الصفحات
// ================================================
const pages = {
  dashboard: document.getElementById('page-dashboard'),
  orders: document.getElementById('page-orders'),
  drivers: document.getElementById('page-drivers'),
  users: document.getElementById('page-users'),
  commissions: document.getElementById('page-commissions'),
  'add-driver': document.getElementById('page-add-driver'),
  'pending-providers': document.getElementById('page-pending-providers'),
  'driver-reports': document.getElementById('page-driver-reports'),
  'user-reports': document.getElementById('page-user-reports'),
  'support-chat': document.getElementById('page-support-chat'),
  'broadcast-drivers': document.getElementById('page-broadcast-drivers'),
  'broadcast-users': document.getElementById('page-broadcast-users'),
  ads: document.getElementById('page-ads'),
  areas: document.getElementById('page-areas'),
  settings: document.getElementById('page-settings')
};

function switchPage(pageId) {
  document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active-page'));
  if (pages[pageId]) pages[pageId].classList.add('active-page');
  else pages.dashboard.classList.add('active-page');
}

document.querySelectorAll('.sidebar ul li[data-page]').forEach(item => {
  item.addEventListener('click', function () {
    const page = this.dataset.page;
    switchPage(page);
    document.querySelectorAll('.sidebar ul li').forEach(li => li.classList.remove('active'));
    this.classList.add('active');
    if (page === 'orders') loadOrders();
    if (page === 'drivers') loadDriversList();
    if (page === 'users') loadUsersList();
    if (page === 'commissions') loadCommissions();
    if (page === 'settings') loadCommissionSettings();
    if (page === 'driver-reports') loadDriverReports();
      if (page === 'user-reports') loadUserReports();
      if (page === 'support-chat') initSupportChat();
      if (page === 'areas') loadAreas();
      if (page === 'ads') loadAds();
      if (page === 'add-driver') {
        document.getElementById('formSuccessMsg').classList.remove('show');
        document.getElementById('formErrorMsg').classList.remove('show');
      }
      if (page === 'pending-providers') loadPendingProviders();
    if (page === 'broadcast-drivers' || page === 'broadcast-users') {
      const el = document.getElementById(page === 'broadcast-drivers' ? 'driverBroadcastResult' : 'userBroadcastResult');
      el.className = 'broadcast-result';
      el.textContent = '';
      loadBroadcastArchive(page === 'broadcast-drivers' ? 'drivers' : 'users');
    }
  });
});

// Responsive navigation: on phones and tablets (<= 900px, see style.css)
// the sidebar is a drawer opened from the top bar.
(function setUpNavigationDrawer() {
  const sidebar = document.getElementById('adminSidebar');
  const toggle = document.getElementById('navToggle');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar || !toggle || !backdrop) return;

  const drawerQuery = window.matchMedia('(max-width: 900px)');

  function setOpen(open) {
    sidebar.classList.toggle('open', open);
    backdrop.classList.toggle('show', open);
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
    if (open) {
      const active = sidebar.querySelector('li.active') || sidebar.querySelector('li');
      if (active) active.focus({ preventScroll: true });
    }
  }

  // Keyboard access to the menu items (they are list items, not buttons).
  sidebar.querySelectorAll('ul li[data-page]').forEach(item => {
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
    item.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        item.click();
      }
    });
    item.addEventListener('click', () => {
      if (drawerQuery.matches) setOpen(false);
    });
  });

  toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebar.classList.contains('open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  // Leaving the drawer layout (rotating a tablet, resizing) resets it.
  drawerQuery.addEventListener('change', event => {
    if (!event.matches) setOpen(false);
  });
})();

document.querySelectorAll('.back-home').forEach(btn => {
  btn.addEventListener('click', function () {
    switchPage('dashboard');
    document.querySelectorAll('.sidebar ul li').forEach(li => li.classList.remove('active'));
    document.querySelector('.sidebar ul li[data-page="dashboard"]').classList.add('active');
  });
});

// ================================================
// 3. بيانات فلسطين (المحافظات والمدن)
// ================================================
const citiesMap = {
  'القدس': ['القدس', 'أبو ديس', 'العيزرية', 'عناتا', 'بيت حنينا', 'شعفاط', 'صور باهر', 'سلوان', 'الطور', 'جبل المكبر'],
  'رام الله والبيرة': ['رام الله', 'البيرة', 'بيتونيا', 'دير عمار', 'سنجل', 'بروقين', 'رنتيس', 'عبوين', 'طيرة', 'بيت ريما', 'الزيتونة'],
  'الخليل': ['الخليل', 'دورا', 'يطا', 'حلحول', 'بني نعيم', 'سعير', 'إذنا', 'بيت كاحل', 'ترقوميا', 'بيت أمر', 'ساس'],
  'نابلس': ['نابلس', 'سبسطية', 'يعبد', 'عقابا', 'بيت إيبا', 'زواتا', 'جوريش', 'قصرة', 'تل'],
  'بيت لحم': ['بيت لحم', 'بيت جالا', 'بيت ساحور', 'الخضر', 'تقوع', 'جناتة', 'زعترة', 'حوسان', 'نحالين', 'بتير'],
  'أريحا': ['أريحا', 'النويعمة', 'العوجا', 'فصايل', 'مرج نعجة', 'الزبارة'],
  'سلفيت': ['سلفيت', 'الزاوية', 'كفل حارس', 'دير بلوط', 'بديا', 'قراوة بني حسن', 'رافات'],
  'جنين': ['جنين', 'يعبد', 'قباطية', 'الزبابدة', 'برطعة', 'عنزة', 'جبع', 'فقعوعة', 'سيلة الحارثية'],
  'طولكرم': ['طولكرم', 'عنبتا', 'بلعا', 'شرقية', 'كفر اللبد', 'دير الغصون', 'علار'],
  'قلقيلية': ['قلقيلية', 'حبلة', 'عزون', 'كفر ثلث', 'جيوس', 'سنيريا', 'عرب الرماضين'],
  'طوباس': ['طوباس', 'بردلة', 'طمون', 'عقابا', 'خربة فرعة'],
  'غزة': ['غزة', 'بيت لاهيا', 'بيت حانون', 'جباليا', 'الزيتون', 'الدرج', 'الرمال', 'الشجاعية', 'تفاح', 'الصبرة'],
  'خان يونس': ['خان يونس', 'بني سهيلا', 'عبسان', 'خزاعة', 'الفخاري', 'القرارة', 'أم الكلاب'],
  'رفح': ['رفح', 'الشوكة', 'النصر', 'البريج', 'المواسي', 'تل السلطان', 'خربة العدس'],
  'دير البلح': ['دير البلح', 'الزوايدة', 'المغازي', 'البريج', 'النصيرات', 'وادي غزة'],
  'شمال غزة': ['بيت لاهيا', 'بيت حانون', 'جباليا', 'أم النصر', 'المسدرة'],
  'حيفا': ['حيفا', 'أم الفحم', 'طيرة الكرمل', 'دالية الكرمل', 'جسر الزرقاء', 'أم الزينات', 'الفريديس'],
  'عكا': ['عكا', 'الناصرة', 'شفا عمرو', 'كفر ياسيف', 'جولس', 'المغار', 'دير الأسد', 'البعنة'],
  'الناصرة': ['الناصرة', 'يافة الناصرة', 'الرينة', 'عين ماهل', 'كفر كنا', 'مشهد', 'كسفا', 'مجدل شمس'],
  'يافا': ['يافا', 'اللد', 'الرملة', 'رحوفوت', 'حولون', 'بات يام', 'أور يهودا', 'رأس العين']
};

// ================================================
// 4. دوال مساعدة
// ================================================
function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function extractNumberFromId(id) { return parseInt(id.replace(/\D/g, ''), 10); }

function getStatusBadge(status) {
  const map = { active: '<span class="status-badge-user active">نشط</span>', inactive: '<span class="status-badge-user inactive">غير نشط</span>', pending: '<span class="status-badge-user pending">قيد المراجعة</span>' };
  return map[status] || escapeHtml(status);
}

function getOrderStatusBadge(status) {
  const map = { 'completed': '<span class="order-status completed">مكتمل</span>', 'in-progress': '<span class="order-status in-progress">قيد التنفيذ</span>', 'pending': '<span class="order-status pending">قيد الانتظار</span>', 'cancelled': '<span class="order-status cancelled">ملغي</span>' };
  return map[status] || escapeHtml(status);
}

function getReportStatusBadge(status) {
  const map = { 'resolved': '<span class="report-status-badge resolved">تم الحل</span>', 'rejected': '<span class="report-status-badge rejected">مرفوض</span>', 'in-review': '<span class="report-status-badge in-review">قيد المراجعة</span>', 'in-progress': '<span class="report-status-badge in-progress">قيد المعالجة</span>' };
  return map[status] || escapeHtml(status);
}

// ================================================
// STARS-010B1 CSP compatibility
// ================================================
function setInlineDisplay(element, visible) {
  if (!element) return;

  element.classList.toggle(
    'csp-hidden',
    !visible,
  );

  element.classList.toggle(
    'csp-inline-block',
    visible,
  );
}

const adminActionHandlers = Object.freeze({
  activateDriver,
  activateUser,
  approveProvider,
  changeDriverPassword,
  changeUserPassword,
  closeChat,
  closeDocuments,
  closeDriverReport,
  closeListModal,
  closeOrderDetails,
  closeReport,
  closeReportDetail,
  closeResetPassword,
  closeUserOrders,
  deleteDriver,
  deleteReport,
  deleteUser,
  deleteAd,
  editAd,
  freezeDriver,
  freezeUser,
  handleResetPassword,
  manageTwoFactor,
  markPaid,
  resetAllCommissions,
  resetDriverCommission,
  openChat,
  openDriverReports,
  openEditDriver,
  openInlineDriverEdit,
  closeDriverEdit,
  openListModal,
  openOrderDetails,
  selectDriverFromList,
  selectUserFromList,
  openReplyModal,
  openResetPassword,
  rejectProvider,
  resolveReport,
  selectGovernorate,
  sendBroadcast,
  sendChatMessage,
  sendReply,
  adminCancelOrder,
  adminEndSuspension,
  adminRejectOffer,
  adminResendOrder,
  toggleAd,
  toggleDriverAvailability,
  viewDocuments,
  viewPendingProviderDocuments,
  viewDriverOrdersViaDB,
  viewReportDetail,
  viewUserOrdersViaDB,
});

function stampStaticAdminActionCapabilities() {
  if (!adminActionCapability) {
    return;
  }

  document
    .querySelectorAll(
      '[data-admin-action]',
    )
    .forEach(
      (element) => {
        element.setAttribute(
          'data-admin-capability',
          adminActionCapability,
        );
      },
    );
}

stampStaticAdminActionCapabilities();


document.addEventListener(
  'click',
  (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const trigger = event.target.closest(
      '[data-admin-action]',
    );

    if (!trigger) {
      return;
    }

    if (
      !adminActionCapability
      || trigger.getAttribute(
        'data-admin-capability',
      ) !== adminActionCapability
    ) {
      return;
    }

    const action = trigger.getAttribute(
      'data-admin-action',
    );

    const handler =
      adminActionHandlers[action];

    if (typeof handler !== 'function') {
      return;
    }

    const argCount = Number(
      trigger.getAttribute(
        'data-admin-arg-count',
      )
      || '0',
    );

    const args = [];

    for (
      let index = 1;
      index <= argCount;
      index += 1
    ) {
      args.push(
        trigger.getAttribute(
          `data-admin-arg-${index}`,
        )
        ?? '',
      );
    }

    handler(...args);
  },
);

// ================================================
// 5. إضافة سائق جديد
// ================================================
document.getElementById('addDriverForm').addEventListener('submit', function (e) {
  e.preventDefault();
  addNewDriver();
});

async function addNewDriver() {
  const form = document.getElementById('addDriverForm');
  const formData = new FormData(form);
  const name =
    String(
      formData.get('driverName')
      || '',
    ).trim();

  const email =
    String(
      formData.get('driverEmail')
      || '',
    ).trim();

  const phone =
    String(
      formData.get('driverPhone')
      || '',
    ).trim();

  const password =
    String(
      formData.get('driverPassword')
      || '',
    );

  const passwordConfirm =
    String(
      formData.get('driverPasswordConfirm')
      || '',
    );

  const governorate =
    String(
      formData.get('driverGovernorate')
      || '',
    ).trim();

  const area =
    String(
      formData.get('driverArea')
      || '',
    ).trim();

  const errorElement =
    document.getElementById('formErrorMsg');

  const successElement =
    document.getElementById('formSuccessMsg');

  if (
    !name
    || !email
    || !phone
    || !password
    || !passwordConfirm
  ) {
    errorElement.textContent =
      'الرجاء ملء جميع الحقول المطلوبة';

    errorElement.classList.add('show');
    successElement.classList.remove('show');
    return;
  }

  if (
    password.length < 12
    || password.length > 128
  ) {
    errorElement.textContent =
      'كلمة المرور الأولية يجب أن تكون بين 12 و128 حرفاً';

    errorElement.classList.add('show');
    successElement.classList.remove('show');
    return;
  }

  if (
    password !== passwordConfirm
  ) {
    errorElement.textContent =
      'كلمتا المرور غير متطابقتين';

    errorElement.classList.add('show');
    successElement.classList.remove('show');
    return;
  }

  if (!governorate || !area) {
    errorElement.textContent =
      'اختر المحافظة والقرية أو المدينة.';
    errorElement.classList.add('show');
    successElement.classList.remove('show');
    return;
  }

  try {
    const payload = {
      driverName: name,
      driverEmail: email,
      driverPhone: phone,
      driverCustomId: String(
        formData.get('driverCustomId') || '',
      ).trim(),
      driverServiceType: String(
        formData.get('driverServiceType') || '',
      ),
      driverLicenseType: String(
        formData.get('driverLicenseType') || '',
      ),
      driverGovernorate: governorate,
      driverArea: area,
      driverPassword: password,
      driverPasswordConfirm: passwordConfirm,
    };

    const res =
      await adminFetch(
        '/admin/drivers',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

    const data =
      await res.json();

    if (data.success) {
      successElement.textContent =
        data.message;

      successElement.classList.add('show');
      errorElement.classList.remove('show');

      form.reset();
      const governorateSelect = document.getElementById('driverGovernorateSelect');
      const areaSelect = document.getElementById('driverAreaSelect');
      if (governorateSelect) governorateSelect.value = '';
      if (areaSelect) {
        areaSelect.innerHTML = '<option value="">اختر القرية أو المدينة...</option>';
        areaSelect.disabled = true;
      }
      loadDashboardStats();

      setTimeout(
        () => {
          successElement.classList.remove('show');
        },
        5000,
      );
    } else {
      errorElement.textContent =
        data.message;

      errorElement.classList.add('show');
      successElement.classList.remove('show');
    }
  } catch (err) {
    errorElement.textContent =
      'حدث خطأ في الاتصال';

    errorElement.classList.add('show');
  }
}

// ================================================
// 6. البحث عن سائق
// ================================================
document.getElementById('driverSearchBtn').addEventListener('click', searchDriver);
document.getElementById('driverSearchInput').addEventListener('keypress', e => { if (e.key === 'Enter') searchDriver(); });

async function searchDriver() {
  const input = document.getElementById('driverSearchInput');
  const raw = input.value.trim();
  if (!raw) return alert('الرجاء إدخال ID السائق أو الاسم');

  const resultElement = document.getElementById('driverResult');
  resultElement.removeAttribute('data-driver-id');

  try {
    const res = await adminFetch(`/admin/drivers/search?id=${encodeURIComponent(raw)}`);
    const data = await res.json();
    if (data.error) {
      document.getElementById('driverResult').innerHTML = `<div class="not-found">${escapeHtml(data.error)}</div>`;
      document.getElementById('driverResult').classList.add('show');
      return;
    }
    renderDriverResultFromDB(data);
  } catch (err) {
    document.getElementById('driverResult').innerHTML = '<div class="not-found">حدث خطأ في البحث</div>';
    document.getElementById('driverResult').classList.add('show');
  }
}

async function ensureAdminAreasLoaded() {
  if (Object.keys(adminAreasByGovernorate).length > 0) return;
  await loadAreasForDropdown();
}

function fillEditGovernorateSelect(selected) {
  const select = document.getElementById('driverEditGovernorate');
  if (!select) return;
  select.innerHTML = '<option value="">اختر المحافظة...</option>';
  Object.keys(adminAreasByGovernorate).sort().forEach((governorate) => {
    const option = document.createElement('option');
    option.value = governorate;
    option.textContent = governorate;
    select.appendChild(option);
  });
  select.value = selected || '';
}

function fillEditAreaSelect(governorate, selected) {
  const select = document.getElementById('driverEditArea');
  if (!select) return;
  select.innerHTML = '<option value="">اختر القرية أو المدينة...</option>';

  if (!governorate) {
    select.disabled = true;
    return;
  }

  select.disabled = false;
  const itself = document.createElement('option');
  itself.value = governorate;
  itself.textContent = `من ${governorate} نفسها`;
  select.appendChild(itself);

  for (const city of adminAreasByGovernorate[governorate] || []) {
    const option = document.createElement('option');
    option.value = city;
    option.textContent = city;
    select.appendChild(option);
  }

  if (
    selected
    && ![...select.options].some((option) => option.value === selected)
  ) {
    const current = document.createElement('option');
    current.value = selected;
    current.textContent = selected;
    select.appendChild(current);
  }

  select.value = selected || '';
}

async function openEditDriver(driverId) {
  try {
    const res = await adminFetch(
      `/admin/drivers/search?id=${encodeURIComponent(driverId)}`,
    );
    const data = await res.json();
    if (data.error || !data.driver) {
      alert(data.error || 'تعذر تحميل بيانات السائق.');
      return;
    }

    await ensureAdminAreasLoaded();
    const driver = data.driver;

    document.getElementById('driverEditId').value = driver._id;
    document.getElementById('driverEditSub').textContent =
      `${driver.name} — ${driver.driverId}`;
    document.getElementById('driverEditName').value = driver.name || '';
    document.getElementById('driverEditEmail').value = driver.email || '';
    document.getElementById('driverEditPhone').value = driver.phone || '';
    document.getElementById('driverEditPublicId').value = driver.publicId || '';
    const commissionDueInput = document.getElementById(
      'driverEditCommissionDue',
    );
    const commissionDue = Number(
      driver.commissionDue ?? data.commission ?? 0,
    );
    commissionDueInput.value = commissionDue.toFixed(2);
    commissionDueInput.dataset.original = commissionDue.toFixed(2);
    document.getElementById('driverEditLicenseType').value =
      driver.licenseType === 'غير محدد' ? '' : (driver.licenseType || '');
    document.getElementById('driverEditStatus').value =
      ['active', 'inactive', 'blocked'].includes(driver.status)
        ? driver.status
        : 'active';
    document.getElementById('driverEditLicenseNotAvailable').checked =
      driver.licenseNotAvailable === true;
    document.getElementById('driverEditAvailable').checked =
      driver.isAvailable !== false;
    document.getElementById('driverEditGovernorateLevel').checked =
      driver.governorateLevel === true;

    const serviceTypes = Array.isArray(driver.serviceTypes)
      ? driver.serviceTypes
      : [];
    document.getElementById('driverEditServiceProduct').checked =
      serviceTypes.includes('product');
    document.getElementById('driverEditServicePeople').checked =
      serviceTypes.includes('people');
    document.getElementById('driverEditServiceGoods').checked =
      serviceTypes.includes('goods');

    fillEditGovernorateSelect(driver.governorate || '');
    fillEditAreaSelect(
      driver.governorate || '',
      driver.area === 'غير محدد' ? '' : (driver.area || ''),
    );

    const msg = document.getElementById('driverEditMsg');
    msg.textContent = '';
    msg.className = 'msg';
    document.getElementById('driverEditModal').classList.add('show');
  } catch (err) {
    alert('تعذر تحميل بيانات السائق.');
  }
}

function closeDriverEdit() {
  document.getElementById('driverEditModal').classList.remove('show');
}

function inlineOption(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function inlineGovernorateOptions(selected) {
  return '<option value="">اختر المحافظة...</option>'
    + Object.keys(adminAreasByGovernorate)
      .sort()
      .map((governorate) => inlineOption(governorate, governorate, selected))
      .join('');
}

function inlineAreaOptions(governorate, selected) {
  let html = '<option value="">اختر القرية أو المدينة...</option>';
  if (!governorate) return html;

  html += inlineOption(
    governorate,
    `من ${governorate} نفسها`,
    selected,
  );

  for (const city of adminAreasByGovernorate[governorate] || []) {
    html += inlineOption(city, city, selected);
  }

  if (
    selected
    && selected !== governorate
    && !(adminAreasByGovernorate[governorate] || []).includes(selected)
  ) {
    html += inlineOption(selected, selected, selected);
  }

  return html;
}

async function openInlineDriverEdit(driverId) {
  try {
    const res = await adminFetch(
      `/admin/drivers/search?id=${encodeURIComponent(driverId)}`,
    );
    const data = await res.json();
    if (data.error || !data.driver) {
      alert(data.error || 'تعذر تحميل بيانات السائق.');
      return;
    }

    await ensureAdminAreasLoaded();
    renderInlineDriverEditor(data.driver, data.commission);
  } catch (err) {
    alert('تعذر تحميل بيانات السائق.');
  }
}

function renderInlineDriverEditor(driver, commission) {
  const container = document.getElementById('driverResult');
  const serviceTypes = Array.isArray(driver.serviceTypes)
    ? driver.serviceTypes
    : [];
  const due = Number(driver.commissionDue ?? commission ?? 0);
  const status = ['active', 'inactive', 'blocked'].includes(driver.status)
    ? driver.status
    : 'active';

  container.innerHTML = `
    <div class="driver-inline-editor">
      <h4><i class="fas fa-user-edit"></i> تعديل مباشر لبيانات السائق</h4>
      <div class="sub">${escapeHtml(driver.name)} — ${escapeHtml(driver.driverId)}</div>
      <form id="inlineDriverForm">
        <input type="hidden" id="inlineDriverId" value="${escapeHtml(driver._id)}">
        <input type="hidden" id="inlineDriverOriginalCommission" value="${escapeHtml(String(due))}">
        <div class="form-grid">
          <div class="form-group"><label>ID السائق (المعرف العام)</label><input id="inlineDriverPublicId" type="text" maxlength="50" value="${escapeHtml(driver.publicId || '')}" required></div>
          <div class="form-group"><label>الاسم الكامل</label><input id="inlineDriverName" type="text" maxlength="120" value="${escapeHtml(driver.name || '')}" required></div>
          <div class="form-group"><label>البريد الإلكتروني</label><input id="inlineDriverEmail" type="email" maxlength="160" value="${escapeHtml(driver.email || '')}" required></div>
          <div class="form-group"><label>رقم الجوال</label><input id="inlineDriverPhone" type="text" maxlength="30" value="${escapeHtml(driver.phone || '')}" required></div>
          <div class="form-group"><label>المحافظة</label><select id="inlineDriverGovernorate" required>${inlineGovernorateOptions(driver.governorate || '')}</select></div>
          <div class="form-group"><label>القرية / المدينة</label><select id="inlineDriverArea" required>${inlineAreaOptions(driver.governorate || '', driver.area === 'غير محدد' ? '' : (driver.area || ''))}</select></div>
          <div class="form-group"><label>حالة الحساب</label><select id="inlineDriverStatus">${inlineOption('active', 'نشط', status)}${inlineOption('inactive', 'موقوف', status)}${inlineOption('blocked', 'محظور', status)}</select></div>
          <div class="form-group"><label>نوع الرخصة</label><input id="inlineDriverLicenseType" type="text" maxlength="120" value="${escapeHtml(driver.licenseType === 'غير محدد' ? '' : (driver.licenseType || ''))}"></div>
          <div class="form-group"><label>عمولة المنصة المستحقة (شيكل)</label><input id="inlineDriverCommissionDue" type="number" min="0" step="0.01" value="${escapeHtml(due.toFixed(2))}" required><small>تعديلها يسجّل تسوية على حساب السائق.</small></div>
          <div class="form-group"><label>أنواع الخدمات</label>
            <div class="service-checkboxes">
              <label class="checkbox-line"><input id="inlineDriverServiceProduct" type="checkbox"${serviceTypes.includes('product') ? ' checked' : ''}> توصيل منتجات</label>
              <label class="checkbox-line"><input id="inlineDriverServicePeople" type="checkbox"${serviceTypes.includes('people') ? ' checked' : ''}> توصيل ركاب</label>
              <label class="checkbox-line"><input id="inlineDriverServiceGoods" type="checkbox"${serviceTypes.includes('goods') ? ' checked' : ''}> نقل بضائع</label>
            </div>
            <small>اترك الجميع فارغاً لاستقبال جميع الخدمات.</small>
          </div>
          <div class="form-group full-width">
            <label class="checkbox-line"><input id="inlineDriverLicenseNotAvailable" type="checkbox"${driver.licenseNotAvailable === true ? ' checked' : ''}> لا يملك رخصة قيادة</label>
            <label class="checkbox-line"><input id="inlineDriverAvailable" type="checkbox"${driver.isAvailable !== false ? ' checked' : ''}> متاح لاستقبال الطلبات الآن</label>
            <label class="checkbox-line"><input id="inlineDriverGovernorateLevel" type="checkbox"${driver.governorateLevel === true ? ' checked' : ''}> استقبال طلبات على مستوى المحافظة</label>
          </div>
        </div>
        <div id="inlineDriverMsg" class="msg"></div>
        <button type="submit" class="btn-submit-driver"><i class="fas fa-save"></i> حفظ التغييرات</button>
        <button type="button" id="inlineDriverCancel" class="modal-close-btn"><i class="fas fa-times"></i> إلغاء</button>
      </form>
    </div>
  `;

  const form = document.getElementById('inlineDriverForm');
  if (form) form.addEventListener('submit', saveInlineDriverEdits);

  const governorate = document.getElementById('inlineDriverGovernorate');
  if (governorate) {
    governorate.addEventListener('change', () => {
      const area = document.getElementById('inlineDriverArea');
      if (area) area.innerHTML = inlineAreaOptions(governorate.value, '');
    });
  }

  const cancel = document.getElementById('inlineDriverCancel');
  if (cancel) {
    cancel.addEventListener('click', () => {
      document.getElementById('driverSearchInput').value =
        driver.publicId || driver._id;
      searchDriver();
    });
  }
}

async function saveInlineDriverEdits(event) {
  event.preventDefault();
  const msg = document.getElementById('inlineDriverMsg');
  const id = document.getElementById('inlineDriverId').value;
  const serviceTypes = [];
  if (document.getElementById('inlineDriverServiceProduct').checked) {
    serviceTypes.push('product');
  }
  if (document.getElementById('inlineDriverServicePeople').checked) {
    serviceTypes.push('people');
  }
  if (document.getElementById('inlineDriverServiceGoods').checked) {
    serviceTypes.push('goods');
  }

  const payload = {
    publicId: document.getElementById('inlineDriverPublicId').value.trim(),
    fullName: document.getElementById('inlineDriverName').value.trim(),
    email: document.getElementById('inlineDriverEmail').value.trim(),
    phone: document.getElementById('inlineDriverPhone').value.trim(),
    governorate: document.getElementById('inlineDriverGovernorate').value,
    area: document.getElementById('inlineDriverArea').value,
    status: document.getElementById('inlineDriverStatus').value,
    licenseType: document.getElementById('inlineDriverLicenseType').value.trim(),
    licenseNotAvailable:
      document.getElementById('inlineDriverLicenseNotAvailable').checked,
    isAvailable: document.getElementById('inlineDriverAvailable').checked,
    governorateLevel:
      document.getElementById('inlineDriverGovernorateLevel').checked,
    serviceTypes,
  };

  const commissionInput = document.getElementById(
    'inlineDriverCommissionDue',
  );
  const originalCommission = Number(
    document.getElementById('inlineDriverOriginalCommission').value,
  );
  const commissionDue = Number(commissionInput.value);
  if (commissionDue !== originalCommission) {
    payload.commissionDue = commissionDue;
  }

  try {
    const res = await adminFetch(
      `/admin/drivers/${encodeURIComponent(id)}/profile`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();

    if (!data.success) {
      msg.textContent = data.message || 'تعذر حفظ التعديلات.';
      msg.className = 'msg error';
      return;
    }

    msg.textContent = data.message || 'تم تحديث بيانات السائق بنجاح.';
    msg.className = 'msg success';
    loadDriversList();
    loadDashboardStats();

    setTimeout(() => {
      document.getElementById('driverSearchInput').value =
        data.driver?.publicId || data.driver?._id || id;
      searchDriver();
    }, 600);
  } catch (err) {
    msg.textContent = 'تعذر حفظ التعديلات.';
    msg.className = 'msg error';
  }
}

async function saveDriverEdits(event) {
  event.preventDefault();
  const id = document.getElementById('driverEditId').value;
  const msg = document.getElementById('driverEditMsg');
  const serviceTypes = [];
  if (document.getElementById('driverEditServiceProduct').checked) {
    serviceTypes.push('product');
  }
  if (document.getElementById('driverEditServicePeople').checked) {
    serviceTypes.push('people');
  }
  if (document.getElementById('driverEditServiceGoods').checked) {
    serviceTypes.push('goods');
  }

  const payload = {
    fullName: document.getElementById('driverEditName').value.trim(),
    email: document.getElementById('driverEditEmail').value.trim(),
    phone: document.getElementById('driverEditPhone').value.trim(),
    publicId: document.getElementById('driverEditPublicId').value.trim(),
    governorate: document.getElementById('driverEditGovernorate').value,
    area: document.getElementById('driverEditArea').value,
    status: document.getElementById('driverEditStatus').value,
    licenseType: document.getElementById('driverEditLicenseType').value.trim(),
    licenseNotAvailable:
      document.getElementById('driverEditLicenseNotAvailable').checked,
    isAvailable: document.getElementById('driverEditAvailable').checked,
    governorateLevel:
      document.getElementById('driverEditGovernorateLevel').checked,
    serviceTypes,
  };

  const commissionDueInput = document.getElementById(
    'driverEditCommissionDue',
  );
  const originalCommissionDue = Number(
    commissionDueInput.dataset.original,
  );
  const commissionDue = Number(commissionDueInput.value);

  // Only send the commission when the admin actually changed it. Otherwise a
  // new order arriving while the modal is open could be overwritten by the
  // stale value loaded when the modal opened.
  if (
    !Number.isFinite(originalCommissionDue)
    || commissionDue !== originalCommissionDue
  ) {
    payload.commissionDue = commissionDue;
  }

  try {
    const res = await adminFetch(
      `/admin/drivers/${encodeURIComponent(id)}/profile`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();

    if (!data.success) {
      msg.textContent = data.message || 'تعذر حفظ التعديلات.';
      msg.className = 'msg error';
      return;
    }

    msg.textContent = data.message || 'تم تحديث بيانات السائق بنجاح.';
    msg.className = 'msg success';

    setTimeout(() => {
      closeDriverEdit();
      searchDriverById(id);
      loadDriversList();
      loadDashboardStats();
    }, 600);
  } catch (err) {
    msg.textContent = 'تعذر حفظ التعديلات.';
    msg.className = 'msg error';
  }
}

const driverEditGovernorate = document.getElementById('driverEditGovernorate');
if (driverEditGovernorate) {
  driverEditGovernorate.addEventListener('change', () => {
    fillEditAreaSelect(driverEditGovernorate.value, '');
  });
}

const driverEditForm = document.getElementById('driverEditForm');
if (driverEditForm) {
  driverEditForm.addEventListener('submit', saveDriverEdits);
}

const driverEditModal = document.getElementById('driverEditModal');
if (driverEditModal) {
  driverEditModal.addEventListener('click', function (event) {
    if (event.target === this) closeDriverEdit();
  });
}

const driverResultElement = document.getElementById('driverResult');
if (driverResultElement) {
  driverResultElement.addEventListener('click', function (event) {
    if (event.target.closest('.driver-inline-editor')) return;
    if (event.target.closest('button, a, input, select, textarea')) return;
    const driverId = driverResultElement.dataset.driverId;
    if (driverId) openInlineDriverEdit(driverId);
  });
}

function renderDriverResultFromDB(data) {
  const {
    driver,
    commission,
    netProfit,
    last30Profit,
    acceptedOrdersCount,
    notAcceptedOrdersCount,
  } = data;
  const container = document.getElementById('driverResult');
  container.dataset.driverId = driver._id;
  const paymentStatus = driver.financial.paymentStatus;
  const hasDue = Number(commission) > 0;
  const paymentLabel = hasDue
    ? `<span class="unpaid-badge">غير مدفوع (${escapeHtml(commission)} )</span>`
    : paymentStatus === 'reset'
      ? '<span class="reset-badge">تم تصفير العداد</span>'
      : paymentStatus === 'paid'
        ? '<span class="paid-badge">تم دفع المستحقات</span>'
        : '<span class="paid-badge">لا توجد مستحقات</span>';
  container.innerHTML = `
    <h4 data-presentation="p017">بيانات السائق</h4>
     <div class="row"><span class="label">ID السائق</span><span class="value">${escapeHtml(driver.driverId)}</span></div>
    <div class="row"><span class="label">الاسم الكامل</span><span class="value">${escapeHtml(driver.name)}</span></div>
    <div class="row"><span class="label">البريد الإلكتروني</span><span class="value">${escapeHtml(driver.email)}</span></div>
    <div class="row"><span class="label">رقم الجوال</span><span class="value">${escapeHtml(driver.phone)}</span></div>
    <div class="row"><span class="label">نوع الخدمة</span><span class="value">${escapeHtml(driver.serviceType || 'غير محدد')}</span></div>
    <div class="row"><span class="label">نوع السائق</span><span class="value">${escapeHtml(driver.licenseType || 'غير محدد')}</span></div>
    ${driver.licenseNotAvailable ? '<div class="row"><span class="label">رخصة القيادة</span><span class="value"><span class="unpaid-badge">غير متوفرة — سُجّل بدون رخصة</span></span></div>' : ''}
    <div class="row"><span class="label">حالة التوفر</span><span class="value">${driver.isAvailable ? '<span class="order-status-badge completed">متاح الآن</span>' : '<span class="order-status-badge cancelled">غير متاح</span>'}${driver.blockedUntil && new Date(driver.blockedUntil) > new Date() ? ' <span class="order-status-badge pending">مشغول بطلب</span>' : ''}</span></div>
    <div class="row"><span class="label">المحافظة</span><span class="value">${escapeHtml(driver.governorate || 'غير محدد')}</span></div>
    <div class="row"><span class="label">المدينة / القرية</span><span class="value">${escapeHtml(driver.city || driver.area || 'غير محدد')}</span></div>
    <div class="row"><span class="label">الحالة</span><span class="value">${getStatusBadge(driver.status)}</span></div>
    <div class="row"><span class="label">إجمالي الطلبات المقبولة</span><span class="value">${escapeHtml(acceptedOrdersCount ?? 0)}</span></div>
    <div class="row"><span class="label">إجمالي الطلبات غير المقبولة</span><span class="value">${escapeHtml(notAcceptedOrdersCount ?? 0)}</span></div>
    <div class="driver-orders-note">المقبولة: الطلبات التي قبلها الزبون وأُسندت للسائق. غير المقبولة: الطلبات التي رفضها السائق، أو لم يقبل الزبون عرضه، أو انتهت مهلة قبول عرض السعر.</div>
    <div class="row"><span class="label">حالة الدفع</span><span class="value">${paymentLabel}</span></div>
    ${Array.isArray(driver.financial.payments) && driver.financial.payments.length > 0 ? `<div class="row"><span class="label">آخر دفعة مسجلة</span><span class="value">${escapeHtml(driver.financial.payments[0].amount)} شيكل — ${escapeHtml(new Date(driver.financial.payments[0].paidAt).toLocaleString('ar-EG'))}</span></div>` : ''}
    <div class="row"><span class="label">إجمالي الأرباح (صافي)</span><span class="value" data-presentation="p002">${escapeHtml(netProfit)} </div>
    <div class="row"><span class="label">أرباح آخر 30 يوم (صافي)</span><span class="value" data-presentation="p018">${escapeHtml(last30Profit)} </div>
    <div class="row"><span class="label">عمولة المنصة المستحقة</span><span class="value" data-presentation="p019">${escapeHtml(commission)} </div>
    <div class="action-buttons">
      <button class="action-btn change-password" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="openInlineDriverEdit" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(driver._id))}">تعديل بيانات السائق</button>
      <button class="action-btn chat" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="openChat" data-admin-arg-count="2" data-admin-arg-1="driver" data-admin-arg-2="${escapeHtml(String(driver._id))}">مراسلة</button>
      <button class="action-btn report" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="viewDriverOrdersViaDB" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(driver._id))}">تقرير الطلبات</button>
      <button class="action-btn orders-report" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="openDriverReports" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(driver._id))}">تقرير رفض وتسليم الطلبات</button>
      <button class="action-btn ${driver.isAvailable ? 'freeze' : 'activate'}" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="toggleDriverAvailability" data-admin-arg-count="2" data-admin-arg-1="${escapeHtml(String(driver._id))}" data-admin-arg-2="${driver.isAvailable ? 'true' : 'false'}">${driver.isAvailable ? 'إيقاف التوفر' : 'جعله متاحاً'}</button>
      <button class="action-btn change-password" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="changeDriverPassword" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(driver._id))}" data-presentation="p020">تغيير كلمة المرور</button>
      ${paymentStatus === 'paid'
        ? '<button class="action-btn paid" disabled>تم دفع المستحقات</button>'
        : hasDue
          ? `<button class="action-btn pay-now" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="markPaid" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(driver._id))}">تم دفع المستحقات</button>`
          : '<button class="action-btn paid" disabled>لا توجد مستحقات</button>'}
      <button class="action-btn reset-commissions" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="resetDriverCommission" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(driver._id))}">تصفير عداد العمولة</button>
      <button class="action-btn docs" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="viewDocuments" data-admin-arg-count="2" data-admin-arg-1="${escapeHtml(String(driver._id))}" data-admin-arg-2="${escapeHtml(String(driver.name || ''))}">الوثائق</button>
      <button class="action-btn freeze" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="freezeDriver" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(driver._id))}">تجميد</button>
      <button class="action-btn activate" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="activateDriver" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(driver._id))}">تفعيل</button>
      <button class="action-btn delete" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="deleteDriver" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(driver._id))}">حذف نهائي</button>
    </div>
  `;
  container.classList.add('show');
}

// ================================================
// 7. البحث عن مستخدم
// ================================================
document.getElementById('userSearchBtn').addEventListener('click', searchUser);
document.getElementById('userSearchInput').addEventListener('keypress', e => { if (e.key === 'Enter') searchUser(); });

async function searchUser() {
  const input = document.getElementById('userSearchInput');
  const raw = input.value.trim();
  if (!raw) return alert('الرجاء إدخال ID المستخدم أو الاسم');

  try {
    const res = await adminFetch(`/admin/users/search?id=${encodeURIComponent(raw)}`);
    const data = await res.json();
    if (data.error) {
      document.getElementById('userResult').innerHTML = `<div class="not-found">${escapeHtml(data.error)}</div>`;
      document.getElementById('userResult').classList.add('show');
      return;
    }
    renderUserResultFromDB(data.user);
  } catch (err) {
    document.getElementById('userResult').innerHTML = '<div class="not-found">حدث خطأ في البحث</div>';
    document.getElementById('userResult').classList.add('show');
  }
}

function renderUserResultFromDB(user) {
  const container = document.getElementById('userResult');
  const orderCount = user.orders ? user.orders.length : 0;
  container.innerHTML = `
    <h4 data-presentation="p017">بيانات المستخدم</h4>
     <div class="row"><span class="label">ID المستخدم</span><span class="value">${escapeHtml(user.userId)}</span></div>
    <div class="row"><span class="label">الاسم الكامل</span><span class="value">${escapeHtml(user.name)}</span></div>
    <div class="row"><span class="label">البريد الإلكتروني</span><span class="value">${escapeHtml(user.email)}</span></div>
    <div class="row"><span class="label">رقم الجوال</span><span class="value">${escapeHtml(user.phone)}</span></div>
    <div class="row"><span class="label">تاريخ التسجيل</span><span class="value">${escapeHtml(user.joinDate)}</span></div>
    <div class="row"><span class="label">المحافظة</span><span class="value">${escapeHtml(user.governorate || 'غير محدد')}</span></div>
    <div class="row"><span class="label">المدينة / القرية</span><span class="value">${escapeHtml(user.city || user.area || 'غير محدد')}</span></div>
    <div class="row"><span class="label">الحالة</span><span class="value">${getStatusBadge(user.status)}</span></div>
    <div class="row"><span class="label">عدد الطلبات</span><span class="value">${escapeHtml(orderCount)}</span></div>
    <div class="action-buttons">
      <button class="action-btn chat" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="openChat" data-admin-arg-count="2" data-admin-arg-1="user" data-admin-arg-2="${escapeHtml(String(user._id))}">مراسلة</button>
      <button class="action-btn orders-report" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="viewUserOrdersViaDB" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(user._id))}">تقرير الطلبات</button>
      <button class="action-btn change-password" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="changeUserPassword" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(user._id))}" data-presentation="p020">تغيير كلمة المرور</button>
      <button class="action-btn freeze" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="freezeUser" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(user._id))}">تجميد</button>
      <button class="action-btn activate" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="activateUser" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(user._id))}">تفعيل</button>
      <button class="action-btn delete" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="deleteUser" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(user._id))}">حذف نهائي</button>
    </div>
  `;
  container.classList.add('show');
}

// ================================================
// 8. الشات
// ================================================
let currentChatTarget = null;
let currentChatName = '';
let legacyChatPollTimer = null;

async function openChat(type, id) {
  currentChatTarget = { type, id };
  currentChatName = '';

  if (!supportSocket || !supportSocket.connected) {
    connectSupportSocket();
  }

  try {
    const res = await adminFetch(`/admin/chat/messages/${type}/${id}`);
    const data = await res.json();
    if (data.error) { alert(data.error); return; }

    currentChatName = data.name || '';
    document.getElementById('chatTitle').textContent = `محادثة مع ${data.name}`;
    document.getElementById('chatSub').textContent = `مراسلة ${data.name} (${type === 'driver' ? 'سائق' : 'مستخدم'})`;
    renderChatMessages(data.messages, data.name);
    document.getElementById('chatModal').classList.add('show');
    document.getElementById('chatInput').value = '';
    document.getElementById('chatInput').focus();
    startLegacyChatPolling();
  } catch (err) {
    alert('حدث خطأ في فتح المحادثة');
  }
}

function startLegacyChatPolling() {
  if (legacyChatPollTimer) clearInterval(legacyChatPollTimer);
  legacyChatPollTimer = setInterval(refreshLegacyChat, 10000);
}

function stopLegacyChatPolling() {
  if (legacyChatPollTimer) {
    clearInterval(legacyChatPollTimer);
    legacyChatPollTimer = null;
  }
}

async function refreshLegacyChat() {
  if (
    !currentChatTarget
    || !document.getElementById('chatModal').classList.contains('show')
  ) {
    return;
  }

  try {
    const res = await adminFetch(
      `/admin/chat/messages/${currentChatTarget.type}/${currentChatTarget.id}`,
    );
    const data = await res.json();
    if (data.error) return;
    currentChatName = data.name || currentChatName;
    renderChatMessages(data.messages, currentChatName);
  } catch (err) {
    console.error('Refresh chat:', err);
  }
}

function renderChatMessages(messages, name) {
  const container = document.getElementById('chatMessages');
  container.innerHTML = '';
  if (!messages || messages.length === 0) {
    container.innerHTML = '<div class="chat-empty">لا توجد رسائل بعد. ابدأ المحادثة!</div>';
    return;
  }
  messages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `chat-msg ${msg.sender === 'admin' ? 'admin' : 'other'}`;
    const senderName = msg.sender === 'admin' ? 'المدير' : (name || 'الطرف الآخر');
    div.innerHTML = `<div class="sender-name">${escapeHtml(senderName)}</div>${escapeHtml(msg.text)}<span class="time">${escapeHtml(msg.time)}</span>`;
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) { alert('الرجاء كتابة رسالة.'); return; }
  if (!currentChatTarget) { alert('لا يوجد محادثة مفتوحة!'); return; }

  try {
    const res = await adminFetch(`/admin/chat/send/${currentChatTarget.type}/${currentChatTarget.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (data.success) {
      currentChatName = data.name || currentChatName;
      renderChatMessages(data.messages, currentChatName);
      input.value = '';
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('حدث خطأ في إرسال الرسالة');
  }
}

function closeChat() {
  document.getElementById('chatModal').classList.remove('show');
  currentChatTarget = null;
  currentChatName = '';
  stopLegacyChatPolling();
}

document.getElementById('chatInput').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') sendChatMessage();
});

// ================================================
// 9. لوحة القيادة - تحميل الإحصائيات
// ================================================
async function loadDashboardStats() {
  try {
    const res = await adminFetch('/admin/api/stats');
    const data = await res.json();
    document.getElementById('totalDrivers').textContent = data.totalDrivers;
    document.getElementById('activeDrivers').textContent = data.activeDrivers;
    document.getElementById('inactiveDrivers').textContent = data.inactiveDrivers;
    document.getElementById('totalUsers').textContent = data.totalUsers;
    document.getElementById('activeUsers').textContent = data.activeUsers;
    document.getElementById('inactiveUsers').textContent = data.inactiveUsers;
    const orderCounts = data.orderTypeCounts || {};
    const productOrders = orderCounts.product || {};
    const peopleOrders = orderCounts.people || {};
    const goodsOrders = orderCounts.goods || {};
    document.getElementById('prodAccepted').textContent = productOrders.accepted || 0;
    document.getElementById('prodNotAccepted').textContent =
      productOrders.notAccepted || 0;
    document.getElementById('passAccepted').textContent = peopleOrders.accepted || 0;
    document.getElementById('passNotAccepted').textContent =
      peopleOrders.notAccepted || 0;
    document.getElementById('cargoAccepted').textContent = goodsOrders.accepted || 0;
    document.getElementById('cargoNotAccepted').textContent =
      goodsOrders.notAccepted || 0;
    const totalCommission = Number(data.totalCommission) || 0;
    document.getElementById('totalCommission').textContent =
      totalCommission.toLocaleString('en-US');
    document.getElementById('pendingDrivers').textContent = data.pendingDrivers;
    document.getElementById('pendingAmount').textContent =
      (Number(data.pendingAmount) || 0).toLocaleString('en-US');

    const driverBadge = document.getElementById('driverReportsBadge');
    if (data.driverReportsPending > 0) { driverBadge.textContent = data.driverReportsPending; setInlineDisplay(driverBadge, true); }
    else { setInlineDisplay(driverBadge, false); }

    const userBadge = document.getElementById('userReportsBadge');
    if (data.userReportsPending > 0) { userBadge.textContent = data.userReportsPending; setInlineDisplay(userBadge, true); }
    else { setInlineDisplay(userBadge, false); }

    // Load pending provider count
    try {
      const pendingRes = await adminFetch('/admin/drivers/pending');
      const pendingData = await pendingRes.json();
      const pendingBadge = document.getElementById('pendingBadge');
      pendingBadge.textContent = pendingData.length;
      setInlineDisplay(pendingBadge, pendingData.length > 0);
    } catch (_) {}

    const topRes = await adminFetch('/admin/api/top-driver');
    const topData = await topRes.json();
    document.getElementById('topDriver').textContent = topData.name;
    document.getElementById('topDriverEarn').textContent =
      (Number(topData.earnings) || 0).toLocaleString('en-US');
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

// ================================================
// 10. العمولات
// ================================================
async function loadCommissionSettings() {
  try {
    const res = await adminFetch('/admin/api/commission-settings');
    if (!res.ok) return;
    const data = await res.json();
    const typeEl = document.getElementById('commissionType');
    const valueEl = document.getElementById('commissionValue');
    if (!typeEl || !valueEl) return;
    typeEl.value = data.type === 'percent' ? 'percent' : 'fixed';
    valueEl.value = data.value;
    const message = document.getElementById('commissionSettingsMessage');
    if (message) {
      message.textContent = '';
      message.className = 'settings-message';
    }
  } catch (err) {
    console.error('Error loading commission settings:', err);
  }
}

async function saveCommissionSettings(event) {
  event.preventDefault();
  const typeEl = document.getElementById('commissionType');
  const valueEl = document.getElementById('commissionValue');
  const message = document.getElementById('commissionSettingsMessage');
  if (!typeEl || !valueEl || !message) return;

  const type = typeEl.value;
  const value = Number(valueEl.value);

  if (!Number.isFinite(value) || value < 0) {
    message.textContent = 'أدخل قيمة صحيحة للعمولة.';
    message.className = 'settings-message error';
    return;
  }

  try {
    const res = await adminFetch('/admin/api/commission-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, value }),
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      message.textContent = data.message || 'تعذر حفظ إعدادات العمولة.';
      message.className = 'settings-message error';
      return;
    }

    valueEl.value = data.config.value;
    message.textContent = 'تم حفظ إعدادات العمولة بنجاح.';
    message.className = 'settings-message success';
  } catch (err) {
    message.textContent = 'تعذر حفظ إعدادات العمولة.';
    message.className = 'settings-message error';
  }
}

const commissionSettingsForm = document.getElementById('commissionSettingsForm');
if (commissionSettingsForm) {
  commissionSettingsForm.addEventListener('submit', saveCommissionSettings);
}

async function loadCommissions() {
  try {
    const res = await adminFetch('/admin/commissions');
    const data = await res.json();
    let rows = '';
    data.driverRows.forEach(driver => {
      const isPaid = driver.paymentStatus === 'paid';
      const isReset = driver.paymentStatus === 'reset';
      const hasDue = Number(driver.commission) > 0;
      const statusText = hasDue
        ? `<span class="status-unpaid">غير مدفوع (${escapeHtml(driver.commission)} )</span>`
        : isReset
          ? '<span class="status-reset">تم تصفير العداد</span>'
          : isPaid
            ? '<span class="status-paid">تم دفع المستحقات</span>'
            : '<span class="status-paid">لا توجد مستحقات</span>';
      const payAction = hasDue
        ? `<button class="action-btn pay-now" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="markPaid" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(driver._id))}" data-presentation="p020">تحديد كمدفوع</button>`
        : '';
      const resetAction = `<button class="action-btn reset-commissions" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="resetDriverCommission" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(driver._id))}">تصفير العداد</button>`;
      const actionHtml = `<div class="table-actions">${payAction}${resetAction}</div>`;
      rows += `<tr><td><strong>${escapeHtml(driver.name)}</strong><br><small data-presentation="p008">${escapeHtml(driver.driverId)}</small></td><td>${escapeHtml(driver.phone || 'غير متوفر')}</td><td>${escapeHtml(driver.serviceType)}</td><td>${escapeHtml(driver.commission)}</td><td>${statusText}</td><td>${actionHtml}</td></tr>`;
    });

    document.getElementById('commissionsContent').innerHTML = `
      <div class="commissions-summary">
        <div class="summary-card"><div class="label">إجمالي العمولات المستحقة</div><div class="number red">${escapeHtml(data.totalUnpaid)} </div></div>
        <div class="summary-card"><div class="label">عدد السائقين المستحقين</div><div class="number orange">${escapeHtml(data.unpaidDrivers)}</div></div>
        <div class="summary-card"><div class="label">إجمالي العمولات المدفوعة</div><div class="number green">${escapeHtml(data.totalPaid)} </div></div>
        <div class="summary-card"><div class="label">عدد السائقين المدفوعين</div><div class="number">${escapeHtml(data.paidDrivers)}</div></div>
      </div>
      <div class="commissions-table-container">
        <h3>تفاصيل عمولات السائقين</h3>
        <table class="commissions-table">
          <thead><tr><th>السائق</th><th>رقم الهاتف</th><th>نوع الخدمة</th><th>العمولة المستحقة</th><th>حالة الدفع</th><th>الإجراء</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error('Error loading commissions:', err);
  }
}

async function markPaid(driverId) {
  if (!confirm('هل أنت متأكد من تحديد السائق كمدفوع؟')) return;
  try {
    const res = await adminFetch(`/admin/commissions/pay/${driverId}`, { method: 'PUT' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadCommissions();
      loadDashboardStats();

      const driversPage = document.getElementById('page-drivers');
      if (driversPage && driversPage.classList.contains('active-page')) {
        searchDriverById(driverId);
      }

      const listModal = document.getElementById('listModal');
      if (
        listModal &&
        listModal.classList.contains('show') &&
        document.getElementById('listModalTitle')?.textContent ===
          'السائقون المستحقون للدفع'
      ) {
        openListModal('payouts', 'unpaid', 'السائقون المستحقون للدفع');
      }
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('حدث خطأ في تحديث حالة الدفع');
  }
}

async function resetDriverCommission(driverId) {
  if (
    !confirm(
      'سيتم تصفير عداد عمولة السائق وإرجاع العمولة له. هل تريد المتابعة؟',
    )
  ) {
    return;
  }

  try {
    const res = await adminFetch(`/admin/commissions/reset/${driverId}`, {
      method: 'PUT',
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'تعذر تصفير عداد العمولة');
      return;
    }

    alert(
      'تم تصفير عداد العمولة' +
        (Number(data.amount) > 0
          ? ` وإرجاع ${data.amount} شيكل للسائق.`
          : '.'),
    );
    loadCommissions();
    loadDashboardStats();

    const driversPage = document.getElementById('page-drivers');
    if (driversPage && driversPage.classList.contains('active-page')) {
      searchDriverById(driverId);
    }

    refreshPayoutsModal();
  } catch (err) {
    alert('حدث خطأ في تصفير عداد العمولة');
  }
}

async function resetAllCommissions() {
  if (
    !confirm(
      'سيتم تصفير عدادات عمولات جميع السائقين وإرجاع العمولة لهم. هل تريد المتابعة؟',
    )
  ) {
    return;
  }

  try {
    const res = await adminFetch('/admin/commissions/reset-all', {
      method: 'PUT',
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'تعذر تصفير عدادات العمولات');
      return;
    }

    alert(
      `تم تصفير ${data.drivers} سائق وإرجاع ${data.amount} شيكل لهم.`,
    );
    loadCommissions();
    loadDashboardStats();
    refreshPayoutsModal();
  } catch (err) {
    alert('حدث خطأ في تصفير عدادات العمولات');
  }
}

function refreshPayoutsModal() {
  const listModal = document.getElementById('listModal');
  if (
    listModal &&
    listModal.classList.contains('show') &&
    document.getElementById('listModalTitle')?.textContent ===
      'السائقون المستحقون للدفع'
  ) {
    openListModal('payouts', 'unpaid', 'السائقون المستحقون للدفع');
  }
}

// ================================================
// 11. المناطق
// ================================================
let governorateStats = {};

async function loadAreas() {
  try {
    const res = await adminFetch('/admin/areas');
    const data = await res.json();
    governorateStats = data.stats;

    let listHtml = '', firstGov = null;
    for (const gov of data.governorateOrder) {
      if (governorateStats[gov]) {
        const s = governorateStats[gov];
        listHtml += `<div class="area-item" data-gov="${escapeHtml(String(gov))}" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="selectGovernorate" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(gov))}"><span class="name">${escapeHtml(gov)}</span><span class="counts" title="عدد السائقين وعدد المستخدمين"><span class="drivers"><i class="fas fa-car"></i> ${escapeHtml(s.totalDrivers)}</span><span class="users"><i class="fas fa-user"></i> ${escapeHtml(s.totalUsers)}</span></span></div>`;
        if (!firstGov) firstGov = gov;
      }
    }

    let detailHtml = firstGov && governorateStats[firstGov] ? buildGovernorateDetail(firstGov, governorateStats[firstGov]) : '<div class="no-city">لا توجد بيانات</div>';
    document.getElementById('areasContainer').innerHTML = `<div class="areas-list">${listHtml}</div><div class="areas-detail" id="areasDetail">${detailHtml}</div>`;
    const firstItem = document.getElementById('areasContainer').querySelector('.area-item');
    if (firstItem) firstItem.classList.add('active');
  } catch (err) {
    console.error('Error loading areas:', err);
  }
}

function buildGovernorateDetail(gov, stats) {
  const renderAccounts = (label, accounts, roleClass) => {
    if (!Array.isArray(accounts) || accounts.length === 0) return '';
    const chips = accounts.map((account) => {
      const publicId = account.publicId
        ? `<small>ID ${escapeHtml(String(account.publicId))}</small>`
        : '';
      return `<span class="account-chip">${escapeHtml(account.fullName || 'غير محدد')}${publicId}</span>`;
    }).join('');
    return `<div class="account-row ${roleClass}"><span class="account-label">${escapeHtml(label)}</span>${chips}</div>`;
  };

  let citiesHtml = '', totalDrivers = 0, totalUsers = 0;
  stats.cities.forEach(city => {
    totalDrivers += city.drivers; totalUsers += city.users;
    const accountsHtml =
      renderAccounts('السائقون', city.driverAccounts, 'drivers')
      + renderAccounts('المستخدمون', city.userAccounts, 'users');
    citiesHtml += `<div class="city-item"><div class="city-head"><span class="city-name">${escapeHtml(city.name)}</span><span class="city-counts"><span class="drivers" title="السائقون"><i class="fas fa-car"></i> ${escapeHtml(city.drivers)}</span><span class="users" title="المستخدمون"><i class="fas fa-user"></i> ${escapeHtml(city.users)}</span></span></div>${accountsHtml ? `<div class="city-accounts">${accountsHtml}</div>` : ''}</div>`;
  });
  if (!citiesHtml) {
    citiesHtml = '<div class="no-city">لا توجد بيانات مسجلة في هذه المحافظة.</div>';
  }
  return `<h3>${escapeHtml(gov)}</h3>${citiesHtml}<div class="total-badge"><span class="label">إجمالي المحافظة</span><span class="total-counts"><span class="drivers" title="السائقون"><i class="fas fa-car"></i> ${escapeHtml(totalDrivers)}</span><span class="users" title="المستخدمون" data-presentation="p022"><i class="fas fa-user"></i> ${escapeHtml(totalUsers)}</span></span></div>`;
}

function selectGovernorate(gov) {
  const items = document.getElementById('areasContainer').querySelectorAll('.area-item');
  items.forEach(item => item.classList.toggle('active', item.dataset.gov === gov));
  const stats = governorateStats[gov];
  if (!stats) return;
  const detailDiv = document.getElementById('areasDetail');
  if (detailDiv) detailDiv.innerHTML = buildGovernorateDetail(gov, stats);
}

// ================================================
// 12. الإبلاغات
// ================================================
async function loadDriverReports() {
  try {
    const res = await adminFetch('/admin/reports/driver');
    const data = await res.json();
    let rows = '';
    data.reports.forEach(report => {
      const replyCount = report.replies ? report.replies.length : 0;
      const reporterName = report.reporterId?.fullName || report.reporter || 'غير معروف';
      const targetId = report.reportedPublicId || '';
      rows += `<tr><td><strong>${escapeHtml(report.reportId)}</strong></td><td>${escapeHtml(reporterName)}</td><td>ID ${escapeHtml(targetId)}</td><td>${escapeHtml(report.category)}</td><td>${escapeHtml(report.date)}</td><td>${getReportStatusBadge(report.status)}</td><td>${escapeHtml(report.content.substring(0, 40))}${report.content.length > 40 ? '...' : ''}</td><td><button class="action-btn info" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="viewReportDetail" data-admin-arg-count="2" data-admin-arg-1="driver" data-admin-arg-2="${escapeHtml(String(report.reportId))}" data-presentation="p020">عرض</button><button class="action-btn reply" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="openReplyModal" data-admin-arg-count="2" data-admin-arg-1="driver" data-admin-arg-2="${escapeHtml(String(report.reportId))}" data-presentation="p020">رد (${replyCount})</button>${report.status !== 'resolved' ? `<button class="action-btn success" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="resolveReport" data-admin-arg-count="2" data-admin-arg-1="driver" data-admin-arg-2="${escapeHtml(String(report.reportId))}" data-presentation="p020">حل</button>` : ''}<button class="action-btn danger" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="deleteReport" data-admin-arg-count="2" data-admin-arg-1="driver" data-admin-arg-2="${escapeHtml(String(report.reportId))}" data-presentation="p020">حذف</button></td></tr>`;
    });
    document.getElementById('driverReportsContent').innerHTML = `<div class="commissions-table-container"><h3>قائمة إبلاغات السائقين</h3><table class="commissions-table"><thead><tr><th>رقم الإبلاغ</th><th>المبلغ</th><th>ID السائق</th><th>النوع</th><th>التاريخ</th><th>الحالة</th><th>المحتوى</th><th>الإجراءات</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } catch (err) { console.error('Error loading driver reports:', err); }
}

async function loadUserReports() {
  try {
    const res = await adminFetch('/admin/reports/user');
    const data = await res.json();
    let rows = '';
    data.reports.forEach(report => {
      const replyCount = report.replies ? report.replies.length : 0;
      const reporterName = report.reporterId?.fullName || report.reporter || 'غير معروف';
      const targetId = report.reportedPublicId || '';
      rows += `<tr><td><strong>${escapeHtml(report.reportId)}</strong></td><td>${escapeHtml(reporterName)}</td><td>ID ${escapeHtml(targetId)}</td><td>${escapeHtml(report.category)}</td><td>${escapeHtml(report.date)}</td><td>${getReportStatusBadge(report.status)}</td><td>${escapeHtml(report.content.substring(0, 40))}${report.content.length > 40 ? '...' : ''}</td><td><button class="action-btn info" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="viewReportDetail" data-admin-arg-count="2" data-admin-arg-1="user" data-admin-arg-2="${escapeHtml(String(report.reportId))}" data-presentation="p020">عرض</button><button class="action-btn reply" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="openReplyModal" data-admin-arg-count="2" data-admin-arg-1="user" data-admin-arg-2="${escapeHtml(String(report.reportId))}" data-presentation="p020">رد (${replyCount})</button>${report.status !== 'resolved' ? `<button class="action-btn success" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="resolveReport" data-admin-arg-count="2" data-admin-arg-1="user" data-admin-arg-2="${escapeHtml(String(report.reportId))}" data-presentation="p020">حل</button>` : ''}<button class="action-btn danger" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="deleteReport" data-admin-arg-count="2" data-admin-arg-1="user" data-admin-arg-2="${escapeHtml(String(report.reportId))}" data-presentation="p020">حذف</button></td></tr>`;
    });
    document.getElementById('userReportsContent').innerHTML = `<div class="commissions-table-container"><h3>قائمة إبلاغات المستخدمين</h3><table class="commissions-table"><thead><tr><th>رقم الإبلاغ</th><th>المبلغ</th><th>ID المستخدم</th><th>النوع</th><th>التاريخ</th><th>الحالة</th><th>المحتوى</th><th>الإجراءات</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } catch (err) { console.error('Error loading user reports:', err); }
}

let currentReportType = null, currentReportId = null;

async function openReplyModal(type, reportId) {
  currentReportType = type; currentReportId = reportId;
  try {
    const res = await adminFetch(`/admin/reports/detail/${reportId}`);
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    const report = data.report;

    document.getElementById('reportDetailTitle').textContent = `إبلاغ رقم ${report.reportId} - ${report.category}`;
    document.getElementById('reportDetailContent').innerHTML = `<div data-presentation="p023"><div class="row"><span class="label">المرسل:</span><span class="value">${escapeHtml(report.reporter)}</span></div><div class="row"><span class="label">النوع:</span><span class="value">${escapeHtml(report.category)}</span></div><div class="row"><span class="label">التاريخ:</span><span class="value">${escapeHtml(report.date)}</span></div><div class="row"><span class="label">الحالة:</span><span class="value">${getReportStatusBadge(report.status)}</span></div><div data-presentation="p024"><span data-presentation="p025">المحتوى الكامل:</span><p data-presentation="p026">${escapeHtml(report.content)}</p></div></div>`;
    renderChatThread(report);
    document.getElementById('reportDetailModal').classList.add('show');
    document.getElementById('replyInput').value = '';
  } catch (err) { alert('حدث خطأ في فتح الإبلاغ'); }
}

function viewReportDetail(type, reportId) { openReplyModal(type, reportId); }

function renderChatThread(report) {
  const threadDiv = document.getElementById('chatThread');
  threadDiv.innerHTML = '';
  if (!report.replies || report.replies.length === 0) {
    threadDiv.innerHTML = '<p data-presentation="p027">لا توجد ردود حتى الآن.</p>';
    return;
  }
  report.replies.forEach(msg => {
    const div = document.createElement('div');
    div.className = `chat-msg ${msg.sender === 'admin' ? 'admin' : 'other'}`;
    const senderName = msg.sender === 'admin' ? 'المدير' : (report.reporter || 'المرسل');
    div.innerHTML = `<div class="sender-name">${escapeHtml(senderName)}</div>${escapeHtml(msg.text)}<span class="time">${escapeHtml(msg.time)}</span>`;
    threadDiv.appendChild(div);
  });
  threadDiv.scrollTop = threadDiv.scrollHeight;
}

async function sendReply() {
  if (!currentReportType || !currentReportId) { alert('لا يوجد إبلاغ مفتوح!'); return; }
  const input = document.getElementById('replyInput');
  const text = input.value.trim();
  if (!text) { alert('الرجاء كتابة رد.'); return; }

  try {
    const res = await adminFetch(`/admin/reports/reply/${currentReportId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (data.success) {
      renderChatThread(data.report);
      input.value = '';
      loadDashboardStats();
      alert('تم إرسال الرد بنجاح.');
    } else {
      alert(data.message);
    }
  } catch (err) { alert('حدث خطأ في إرسال الرد'); }
}

async function resolveReport(type, reportId) {
  if (!confirm('هل أنت متأكد من تغيير الحالة إلى "تم الحل"؟')) return;
  try {
    await adminFetch(`/admin/reports/${reportId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }) });
    if (type === 'driver') loadDriverReports(); else loadUserReports();
    loadDashboardStats();
    alert('تم تغيير الحالة بنجاح.');
  } catch (err) { alert('حدث خطأ'); }
}

async function deleteReport(type, reportId) {
  if (!confirm('هل أنت متأكد من حذف هذا الإبلاغ نهائياً؟')) return;
  try {
    await adminFetch(`/admin/reports/${reportId}`, { method: 'DELETE' });
    if (type === 'driver') loadDriverReports(); else loadUserReports();
    loadDashboardStats();
    alert('تم حذف الإبلاغ بنجاح.');
  } catch (err) { alert('حدث خطأ'); }
}

// ================================================
// 13. الإرسال الجماعي
// ================================================
async function sendBroadcast(target) {
  const titleInput = document.getElementById(target === 'drivers' ? 'driverBroadcastTitle' : 'userBroadcastTitle');
  const bodyInput = document.getElementById(target === 'drivers' ? 'driverBroadcastBody' : 'userBroadcastBody');
  const resultDiv = document.getElementById(target === 'drivers' ? 'driverBroadcastResult' : 'userBroadcastResult');
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title || !body) {
    resultDiv.className = 'broadcast-result error';
    resultDiv.textContent = 'الرجاء إدخال عنوان ونص للرسالة.';
    return;
  }

  try {
    const res = await adminFetch(`/admin/broadcast/${target}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body })
    });
    const data = await res.json();
    if (data.success) {
      resultDiv.className = 'broadcast-result success';
      resultDiv.innerHTML = `تم إرسال الرسالة بنجاح إلى <strong>${escapeHtml(data.count)}</strong> ${target === 'drivers' ? 'سائق' : 'مستخدم'}.<br><span data-presentation="p028">العنوان: ${escapeHtml(title)}</span><br><span data-presentation="p028">تم الإرسال في: ${escapeHtml(data.sentAt)}</span>`;
      loadBroadcastArchive(target);
    } else {
      resultDiv.className = 'broadcast-result error';
      resultDiv.textContent = data.message;
    }
  } catch (err) {
    resultDiv.className = 'broadcast-result error';
    resultDiv.textContent = 'حدث خطأ في الإرسال';
  }
}

async function loadBroadcastArchive(target) {
  const container = document.getElementById(
    target === 'drivers' ? 'driverBroadcastArchive' : 'userBroadcastArchive',
  );
  if (!container) return;

  try {
    const res = await adminFetch(`/admin/broadcast/archive/${target}`);
    const messages = await res.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      container.innerHTML =
        '<p>لا توجد رسائل مرسلة خلال آخر 30 يوماً.</p>';
      return;
    }

    container.innerHTML = messages
      .map((message) => {
        const sentAt = message.sentAt
          ? new Date(message.sentAt).toLocaleString('ar-EG')
          : '';

        return `<div class="archive-item">
          <div class="archive-title">${escapeHtml(message.title)}</div>
          <div class="archive-body">${escapeHtml(message.body)}</div>
          <div class="archive-meta">
            <span>${escapeHtml(message.recipientCount)} ${target === 'drivers' ? 'سائق' : 'مستخدم'}</span>
            <span>${escapeHtml(sentAt)}</span>
          </div>
        </div>`;
      })
      .join('');
  } catch (err) {
    container.innerHTML = '<p>تعذر تحميل أرشيف الرسائل.</p>';
  }
}

// ================================================
// 14. إجراءات السائقين والمستخدمين
// ================================================
async function freezeDriver(id) {
  try {
    await adminFetch(`/admin/drivers/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'inactive' }) });
    alert('تم تجميد حساب السائق بنجاح.');
    searchDriverById(id);
    loadDashboardStats();
  } catch (err) { alert('حدث خطأ'); }
}

async function activateDriver(id) {
  try {
    await adminFetch(`/admin/drivers/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) });
    alert('تم تفعيل حساب السائق بنجاح.');
    searchDriverById(id);
    loadDashboardStats();
  } catch (err) { alert('حدث خطأ'); }
}

async function deleteDriver(id) {
  if (!confirm('هل أنت متأكد من حذف السائق نهائياً؟')) return;
  try {
    const res = await adminFetch(`/admin/drivers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    alert(data.message);
    document.getElementById('driverResult').classList.remove('show');
    loadDashboardStats();
  } catch (err) { alert('حدث خطأ'); }
}

async function changeDriverPassword(driverId) {
  const newPassword = prompt('أدخل كلمة المرور الجديدة للسائق:', '');
  if (!newPassword || newPassword.trim() === '') { alert('كلمة المرور لا يمكن أن تكون فارغة.'); return; }
  const confirmPassword = prompt('أعد إدخال كلمة المرور الجديدة للتأكيد:', '');
  if (!confirmPassword || newPassword !== confirmPassword) { alert('كلمة المرور وتأكيدها غير متطابقين.'); return; }
  try {
    const res = await adminFetch(`/admin/drivers/${driverId}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: newPassword,
        confirmPassword,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'تعذر تغيير كلمة المرور.');
      return;
    }
    alert(data.message || 'تم تغيير كلمة المرور بنجاح.');
    searchDriverById(driverId);
  } catch (err) { alert('حدث خطأ'); }
}

async function freezeUser(id) {
  try {
    await adminFetch(`/admin/users/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'inactive' }) });
    alert('تم تجميد حساب المستخدم بنجاح.');
    searchUserById(id);
    loadDashboardStats();
  } catch (err) { alert('حدث خطأ'); }
}

async function activateUser(id) {
  try {
    await adminFetch(`/admin/users/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) });
    alert('تم تفعيل حساب المستخدم بنجاح.');
    searchUserById(id);
    loadDashboardStats();
  } catch (err) { alert('حدث خطأ'); }
}

async function deleteUser(id) {
  alert('هذه الميزة غير مفعلة حالياً.');
  // if (!confirm('هل أنت متأكد من حذف المستخدم نهائياً؟')) return;
  // try {
  //   const res = await adminFetch(`/admin/users/${id}`, { method: 'DELETE' });
  //   const data = await res.json();
  //   alert(data.message);
  //   document.getElementById('userResult').classList.remove('show');
  //   loadDashboardStats();
  // } catch (err) { alert('حدث خطأ'); }
}

async function changeUserPassword(userId) {
  const newPassword = prompt('أدخل كلمة المرور الجديدة للمستخدم:', '');
  if (!newPassword || newPassword.trim() === '') { alert('كلمة المرور لا يمكن أن تكون فارغة.'); return; }
  const confirmPassword = prompt('أعد إدخال كلمة المرور الجديدة للتأكيد:', '');
  if (!confirmPassword || newPassword !== confirmPassword) { alert('كلمة المرور وتأكيدها غير متطابقين.'); return; }
  try {
    const res = await adminFetch(`/admin/users/${userId}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: newPassword,
        confirmPassword,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'تعذر تغيير كلمة المرور.');
      return;
    }
    alert(data.message || 'تم تغيير كلمة المرور بنجاح.');
    searchUserById(userId);
  } catch (err) { alert('حدث خطأ'); }
}

function searchDriverById(id) {
  document.getElementById('driverSearchInput').value = id;
  searchDriver();
}

function searchUserById(id) {
  document.getElementById('userSearchInput').value = id;
  searchUser();
}

// ================================================
// 15. عرض الوثائق وطلبات السائق/المستخدم
// ================================================
const providerDocumentKinds =
  Object.freeze([
    'identity_document',
    'driver_license',
  ]);

const providerDocumentLabels =
  Object.freeze({
    identity_document:
      'وثيقة الهوية',
    driver_license:
      'رخصة القيادة',
  });

function formatProviderDocumentBytes(size) {
  const numeric =
    Number(size);

  if (
    !Number.isFinite(numeric)
    || numeric < 0
  ) {
    return 'غير معروف';
  }

  if (numeric < 1024) {
    return `${numeric} B`;
  }

  if (numeric < 1024 * 1024) {
    return `${(
      numeric / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    numeric / (1024 * 1024)
  ).toFixed(2)} MB`;
}

function formatProviderDocumentDate(value) {
  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return 'غير معروف';
  }

  return parsed.toLocaleString(
    'ar-EG',
  );
}

function providerDocumentDownloadUrl(
  scope,
  providerId,
  kind,
) {
  const encodedId =
    encodeURIComponent(
      String(providerId),
    );

  const encodedKind =
    encodeURIComponent(
      String(kind),
    );

  if (scope === 'pending') {
    return (
      `/admin/drivers/pending/${encodedId}`
      + `/documents/${encodedKind}`
    );
  }

  return (
    `/admin/drivers/documents/${encodedId}`
    + `/${encodedKind}`
  );
}

function renderProviderDocumentReview(
  data,
  scope,
  providerId,
) {
  const listContainer =
    document.getElementById(
      'documentsList',
    );

  const documents =
    Array.isArray(
      data.documents,
    )
      ? data.documents
      : [];

  const complete =
    data.complete === true;

  const licenseWaived =
    data.licenseNotAvailable === true;

  const completionText =
    licenseWaived
      ? 'مسجل بدون رخصة قيادة'
      : (
          complete
            ? 'الوثيقة المطلوبة مكتملة'
            : 'الوثيقة المطلوبة غير مكتملة'
        );

  const completionClass =
    complete
      ? 'paid-badge'
      : 'unpaid-badge';

  let html =
    `<div class="doc-item">`
    + `<span class="doc-name">حالة المراجعة</span>`
    + `<span class="doc-status">`
    + `<span class="${completionClass}">`
    + `${escapeHtml(completionText)}`
    + `</span>`
    + `</span>`
    + `</div>`;

  for (
    const kind
    of providerDocumentKinds
  ) {
    const document =
      documents.find(
        (candidate) =>
          candidate
          && candidate.kind === kind,
      );

    const label =
      providerDocumentLabels[kind];

    if (!document) {
      if (kind === 'identity_document') {
        continue;
      }

      html +=
        `<div class="doc-item">`
        + `<span class="doc-name">`
        + `${escapeHtml(label)}`
        + `</span>`
        + `<span class="doc-status">`
        + `<span data-presentation="p003">`
        + `غير متوفرة`
        + `</span>`
        + `</span>`
        + `</div>`;

      continue;
    }

    const downloadUrl =
      providerDocumentDownloadUrl(
        scope,
        providerId,
        kind,
      );

    html +=
      `<div class="doc-item">`
      + `<span class="doc-name">`
      + `${escapeHtml(label)}`
      + `</span>`
      + `<span class="doc-status">`
      + `${escapeHtml(document.contentType)}`
      + ` · `
      + `${escapeHtml(formatProviderDocumentBytes(document.size))}`
      + ` · `
      + `${escapeHtml(formatProviderDocumentDate(document.uploadedAt))}`
      + ` &nbsp; `
      + `<a class="action-btn info" `
      + `href="${escapeHtml(downloadUrl)}" `
      + `download>`
      + `<i class="fas fa-download"></i> تنزيل`
      + `</a>`
      + `</span>`
      + `</div>`;
  }

  listContainer.innerHTML =
    html;
}

async function openProviderDocuments(
  scope,
  providerId,
  providerName,
) {
  const encodedId =
    encodeURIComponent(
      String(providerId),
    );

  const metadataUrl =
    scope === 'pending'
      ? (
          `/admin/drivers/pending/${encodedId}`
          + '/documents'
        )
      : (
          `/admin/drivers/documents/${encodedId}`
        );

  try {
    const res =
      await adminFetch(
        metadataUrl,
      );

    const data =
      await res.json();

    if (!res.ok) {
      alert(
        data.error
        || 'تعذر تحميل وثائق المزود',
      );
      return;
    }

    document
      .getElementById(
        'docDriverName',
      )
      .textContent =
        providerName
          ? `اسم السائق: ${providerName}`
          : `معرف السائق: ${providerId}`;

    renderProviderDocumentReview(
      data,
      scope,
      providerId,
    );

    document
      .getElementById(
        'documentsModal',
      )
      .classList.add(
        'show',
      );
  } catch (_) {
    alert(
      'حدث خطأ في تحميل الوثائق',
    );
  }
}

async function viewDocuments(
  driverId,
  driverName = '',
) {
  return openProviderDocuments(
    'active',
    driverId,
    driverName,
  );
}

async function viewPendingProviderDocuments(
  pendingId,
  providerName = '',
) {
  return openProviderDocuments(
    'pending',
    pendingId,
    providerName,
  );
}

async function viewDriverOrdersViaDB(driverId) {
  try {
    const res = await adminFetch(`/admin/drivers/search?id=${driverId}`);
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    const { driver, netProfit, last30Profit, totalCommission } = data;
    document.getElementById('reportDriverName').textContent = `اسم السائق: ${driver.name} (${driver.driverId})`;
    const content = document.getElementById('reportContent');
    if (driver.financial && driver.financial.transactions && driver.financial.transactions.length > 0) {
      let rows = '';
      driver.financial.transactions.forEach(t => {
        rows += `<tr><td>${escapeHtml(t.id.slice(-8))}</td><td>${escapeHtml(t.desc)}</td><td>${escapeHtml(t.date)}</td><td class="amount">${escapeHtml(t.amount)} </td><td><button class="order-action-btn details" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="openOrderDetails" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(t.id))}">عرض</button></td></tr>`;
      });
      content.innerHTML = `
        <div class="invoice-box">
          <table class="invoice-table"><thead><tr><th>رقم المعاملة</th><th>الوصف</th><th>التاريخ</th><th>المبلغ</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table>
          <div class="invoice-total"><span class="total-label">صافي الأرباح</span><span class="total-value">${escapeHtml(netProfit)} </span></div>
          <div data-presentation="p029"><span>آخر 30 يوم: ${escapeHtml(last30Profit)} </span><span>عمولة المنصة: ${escapeHtml(totalCommission || 0)} </span></div>
        </div>`;
    } else {
      content.innerHTML = '<p data-presentation="p030">لا توجد معاملات مسجلة.</p>';
    }
    document.getElementById('reportModal').classList.add('show');
  } catch (err) { alert('حدث خطأ في تحميل التقرير'); }
}

async function viewUserOrdersViaDB(userId) {
  try {
    const res = await adminFetch(`/admin/users/search?id=${userId}`);
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    const user = data.user;
    document.getElementById('userOrdersName').textContent = `اسم المستخدم: ${user.name} (${user.userId})`;
    const content = document.getElementById('userOrdersContent');
    if (user.orders && user.orders.length > 0) {
      let rows = '';
      user.orders.forEach(o => {
        rows += `<tr><td>${escapeHtml(o.orderId)}</td><td>${escapeHtml(o.type)}</td><td>${escapeHtml(o.date)}</td><td>${escapeHtml(o.status)}</td><td class="amount">${escapeHtml(o.amount)} </td><td><button class="order-action-btn details" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="openOrderDetails" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(o.fullId || ''))}">عرض</button></td></tr>`;
      });
      content.innerHTML = `<div class="invoice-box"><table class="invoice-table"><thead><tr><th>رقم الطلب</th><th>النوع</th><th>التاريخ</th><th>الحالة</th><th>المبلغ</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } else {
      content.innerHTML = '<p data-presentation="p030">لا توجد طلبات مسجلة.</p>';
    }
    document.getElementById('userOrdersModal').classList.add('show');
  } catch (err) { alert('حدث خطأ في تحميل الطلبات'); }
}

// ================================================
// 19. إدارة الطلبات وتقارير السائق
// ================================================
function adminOrderStatusLabel(status) {
  const map = {
    pending: 'قيد الانتظار',
    offered: 'عروض متوفرة',
    accepted: 'تم قبول عرض',
    fulfilling: 'جاري العمل على الطلب',
    completed: 'تم انجاز الطلب',
    cancelled: 'تم إلغاء الطلب',
    expired: 'انتهت مدة قبول السعر',
  };
  return map[status] || status || 'غير محدد';
}

function adminOrderTypeLabel(type) {
  const map = {
    product: 'طلب منتج',
    people: 'نقل أشخاص',
    goods: 'نقل بضاعة',
  };
  return map[type] || type || 'غير محدد';
}

function adminOrderStatusBadge(status) {
  return `<span class="order-status-badge ${escapeHtml(status)}">${escapeHtml(adminOrderStatusLabel(status))}</span>`;
}

function adminOrderCustomer(order) {
  const customer = order.customerId;
  if (!customer || typeof customer !== 'object') {
    return { name: 'غير محدد', publicId: '', phone: '' };
  }
  const phones = Array.isArray(customer.phoneNumbers) ? customer.phoneNumbers : [];
  const primary = phones.find((phone) => phone.primary) || phones[0] || {};
  return {
    name: customer.fullName || 'غير محدد',
    publicId: customer.publicId || '',
    phone: primary.number || '',
  };
}

function adminOrderProvider(order) {
  const provider = order.providerId;
  if (!provider || typeof provider !== 'object') {
    return { name: 'غير معين', publicId: '', phone: '' };
  }
  const phones = Array.isArray(provider.phoneNumbers) ? provider.phoneNumbers : [];
  const primary = phones.find((phone) => phone.primary) || phones[0] || {};
  return {
    name: provider.fullName || 'غير معين',
    publicId: provider.publicId || '',
    phone: primary.number || '',
  };
}

function adminOrderDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ar-EG');
}

async function loadOrders() {
  const search = (document.getElementById('orderSearchInput')?.value || '').trim();
  const status = document.getElementById('orderStatusFilter')?.value || 'all';
  const type = document.getElementById('orderTypeFilter')?.value || 'all';
  const area = (document.getElementById('orderAreaFilter')?.value || '').trim();
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (status && status !== 'all') params.set('status', status);
  if (type && type !== 'all') params.set('type', type);
  if (area) params.set('area', area);

  const container = document.getElementById('ordersContent');
  if (!container) return;

  try {
    const res = await adminFetch(`/admin/orders?${params.toString()}`);
    const orders = await res.json();

    if (!Array.isArray(orders)) {
      container.innerHTML = `<p data-presentation="p030">${escapeHtml(orders.error || 'تعذر تحميل الطلبات')}</p>`;
      container.classList.add('show');
      return;
    }

    if (orders.length === 0) {
      container.innerHTML = '<p data-presentation="p030">لا توجد طلبات مطابقة.</p>';
      container.classList.add('show');
      return;
    }

    const rows = orders.map((order) => {
      const customer = adminOrderCustomer(order);
      const provider = adminOrderProvider(order);
      const id = String(order._id || '');
      const safeId = escapeHtml(id);
      const isClosed = ['completed', 'cancelled'].includes(order.status);
      let actions = `<button class="order-action-btn details" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="openOrderDetails" data-admin-arg-count="1" data-admin-arg-1="${safeId}"><i class="fas fa-eye"></i> تفاصيل</button>`;
      if (!isClosed) {
        actions += ` <button class="order-action-btn cancel" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="adminCancelOrder" data-admin-arg-count="1" data-admin-arg-1="${safeId}"><i class="fas fa-ban"></i> إلغاء</button>`;
      }
      if (['pending', 'offered'].includes(order.status)) {
        actions += ` <button class="order-action-btn resend" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="adminResendOrder" data-admin-arg-count="1" data-admin-arg-1="${safeId}"><i class="fas fa-paper-plane"></i> إعادة إرسال</button>`;
      }
      if (order.status === 'pending' && order.offerSuspendedUntil) {
        actions += ` <button class="order-action-btn suspend" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="adminEndSuspension" data-admin-arg-count="1" data-admin-arg-1="${safeId}"><i class="fas fa-hourglass-end"></i> إنهاء التعليق</button>`;
      }
      const suspended = order.offerSuspendedUntil && new Date(order.offerSuspendedUntil) > new Date();
      return `<tr>
        <td>${safeId.slice(-8)}</td>
        <td>${escapeHtml(adminOrderTypeLabel(order.type))}</td>
        <td>${escapeHtml(customer.name)}${customer.publicId ? `<br><small>ID ${escapeHtml(customer.publicId)}</small>` : ''}</td>
        <td>${escapeHtml(provider.name)}${provider.publicId ? `<br><small>ID ${escapeHtml(provider.publicId)}</small>` : ''}</td>
        <td>${escapeHtml(order.area || '')}</td>
        <td>${adminOrderStatusBadge(order.status)}${suspended ? `<br><small class="order-meta">معلق حتى ${escapeHtml(adminOrderDate(order.offerSuspendedUntil))}</small>` : ''}</td>
        <td>${escapeHtml(String(order.price || 0))}</td>
        <td>${escapeHtml(adminOrderDate(order.createdAt))}</td>
        <td><div class="order-actions">${actions}</div></td>
      </tr>`;
    }).join('');

    container.innerHTML = `<div data-presentation="p002"><table class="orders-table"><thead><tr><th>الطلب</th><th>النوع</th><th>الزبون</th><th>السائق</th><th>المنطقة</th><th>الحالة</th><th>السعر</th><th>التاريخ</th><th>إجراءات</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    container.classList.add('show');
  } catch (err) {
    container.innerHTML = '<p data-presentation="p030">حدث خطأ في تحميل الطلبات.</p>';
    container.classList.add('show');
  }
}

async function openOrderDetails(orderId) {
  try {
    const res = await adminFetch(`/admin/orders/${encodeURIComponent(orderId)}`);
    const data = await res.json();
    if (data.error) { alert(data.error); return; }

    const { order, offers, rejections } = data;
    const customer = adminOrderCustomer(order);
    const provider = adminOrderProvider(order);

    let html = `
      <div class="row"><span class="label">رقم الطلب</span><span class="value">${escapeHtml(String(order._id))}</span></div>
      <div class="row"><span class="label">النوع</span><span class="value">${escapeHtml(adminOrderTypeLabel(order.type))}</span></div>
      <div class="row"><span class="label">الحالة</span><span class="value">${adminOrderStatusBadge(order.status)}</span></div>
      <div class="row"><span class="label">الزبون</span><span class="value">${escapeHtml(customer.name)} ${customer.publicId ? `(ID ${escapeHtml(customer.publicId)})` : ''}${customer.phone ? ` - ${escapeHtml(customer.phone)}` : ''}</span></div>
      <div class="row"><span class="label">السائق</span><span class="value">${escapeHtml(provider.name)} ${provider.publicId ? `(ID ${escapeHtml(provider.publicId)})` : ''}${provider.phone ? ` - ${escapeHtml(provider.phone)}` : ''}</span></div>
      <div class="row"><span class="label">المنطقة</span><span class="value">${escapeHtml(order.area || 'غير محدد')}</span></div>
      <div class="row"><span class="label">الوصف</span><span class="value">${escapeHtml(order.description || '')}</span></div>
      <div class="row"><span class="label">هاتف الطلب</span><span class="value">${escapeHtml(order.phone || '')}</span></div>
      <div class="row"><span class="label">السعر</span><span class="value">${escapeHtml(String(order.price || 0))}</span></div>
      <div class="row"><span class="label">تاريخ الإنشاء</span><span class="value">${escapeHtml(adminOrderDate(order.createdAt))}</span></div>
      <div class="row"><span class="label">انتهاء مهلة العرض</span><span class="value">${escapeHtml(adminOrderDate(order.offerWindowExpiredAt))}</span></div>
      <div class="row"><span class="label">نهاية التعليق</span><span class="value">${escapeHtml(adminOrderDate(order.offerSuspendedUntil))}</span></div>
      <div class="row"><span class="label">تاريخ الإنجاز</span><span class="value">${escapeHtml(adminOrderDate(order.completedAt))}</span></div>
    `;

    html += '<div class="order-section-title">عروض الأسعار</div>';
    if (!offers || offers.length === 0) {
      html += '<p data-presentation="p030">لا توجد عروض.</p>';
    } else {
      offers.forEach((offer) => {
        const offerProvider = offer.providerId && typeof offer.providerId === 'object' ? offer.providerId : {};
        const rejectButton = offer.status === 'pending'
          ? `<button class="order-action-btn reject" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="adminRejectOffer" data-admin-arg-count="2" data-admin-arg-1="${escapeHtml(String(order._id))}" data-admin-arg-2="${escapeHtml(String(offer._id))}"><i class="fas fa-times"></i> رفض العرض</button>`
          : '';
        html += `<div class="order-offer-row">
          <div class="line"><strong>${escapeHtml(offerProvider.fullName || 'غير محدد')}</strong><span>${escapeHtml(String(offer.price || 0))} شيكل</span></div>
          <div class="line"><span class="muted">الوقت: ${escapeHtml(String(offer.estimatedTime || 0))} دقيقة</span><span class="muted">${escapeHtml(offer.status || '')}</span></div>
          <div class="line"><span class="muted">${escapeHtml(adminOrderDate(offer.createdAt))}</span>${rejectButton}</div>
        </div>`;
      });
    }

    html += '<div class="order-section-title">سجل الرفض والانتهاء</div>';
    if (!rejections || rejections.length === 0) {
      html += '<p data-presentation="p030">لا يوجد سجل رفض.</p>';
    } else {
      rejections.forEach((rejection) => {
        const rejectionProvider = rejection.providerId && typeof rejection.providerId === 'object' ? rejection.providerId : {};
        const reason = rejection.reason === 'offer_expired' ? 'انتهاء مدة عرض السعر' : 'تم رفض الطلب من جهتك';
        html += `<div class="order-offer-row">
          <div class="line"><strong>${escapeHtml(rejectionProvider.fullName || 'غير محدد')}</strong><span class="muted">${escapeHtml(adminOrderDate(rejection.createdAt))}</span></div>
          <div class="line"><span class="muted">${escapeHtml(reason)}</span></div>
        </div>`;
      });
    }

    document.getElementById('orderDetailsSub').textContent = `طلب #${String(order._id).slice(-8)} - ${customer.name}`;
    document.getElementById('orderDetailsContent').innerHTML = html;
    document.getElementById('orderDetailsModal').classList.add('show');
  } catch (err) {
    alert('حدث خطأ في تحميل تفاصيل الطلب');
  }
}

async function adminCancelOrder(orderId) {
  if (!confirm('هل تريد إلغاء هذا الطلب نهائياً؟')) return;
  await runOrderAction(orderId, 'cancel');
}

async function adminResendOrder(orderId) {
  if (!confirm('هل تريد إعادة إرسال الطلب للسائقين؟')) return;
  await runOrderAction(orderId, 'resend');
}

async function adminEndSuspension(orderId) {
  if (!confirm('هل تريد إنهاء تعليق الطلب ونقله إلى التقارير؟')) return;
  await runOrderAction(orderId, 'end-suspension');
}

async function runOrderAction(orderId, action) {
  try {
    const res = await adminFetch(`/admin/orders/${encodeURIComponent(orderId)}/${action}`, { method: 'POST' });
    const data = await res.json();
    alert(data.message || data.error || 'تم تنفيذ الإجراء');
    loadOrders();
    if (document.getElementById('orderDetailsModal').classList.contains('show')) {
      openOrderDetails(orderId);
    }
  } catch (err) {
    alert('تعذر تنفيذ الإجراء');
  }
}

async function adminRejectOffer(orderId, offerId) {
  if (!confirm('هل تريد رفض عرض السعر هذا؟')) return;
  try {
    const res = await adminFetch(`/admin/orders/${encodeURIComponent(orderId)}/offers/${encodeURIComponent(offerId)}/reject`, { method: 'POST' });
    const data = await res.json();
    alert(data.message || data.error || 'تم رفض العرض');
    loadOrders();
    openOrderDetails(orderId);
  } catch (err) {
    alert('تعذر رفض العرض');
  }
}

function closeOrderDetails() {
  document.getElementById('orderDetailsModal').classList.remove('show');
}

async function openDriverReports(driverId) {
  try {
    const res = await adminFetch(`/admin/drivers/${encodeURIComponent(driverId)}/reports`);
    const data = await res.json();
    if (data.error) { alert(data.error); return; }

    let html = '';
    if (!data.report || data.report.length === 0) {
      html = '<p data-presentation="p030">لا توجد سجلات في التقرير.</p>';
    } else {
      data.report.forEach((entry) => {
        const customer = entry.customerId && typeof entry.customerId === 'object' ? entry.customerId : {};
        const isDelivered = entry.recordType === 'delivered';
        const reason = isDelivered
          ? 'تم انجاز الطلب'
          : entry.reason === 'offer_expired'
            ? 'انتهاء مدة عرض السعر'
            : 'تم رفض الطلب من جهتك';
        html += `<div class="order-offer-row">
          <div class="line"><strong>${escapeHtml(adminOrderTypeLabel(entry.type))}</strong><span>${escapeHtml(reason)}</span></div>
          <div class="line"><span class="muted">الزبون: ${escapeHtml(customer.fullName || 'غير محدد')}${customer.publicId ? ` (ID ${escapeHtml(customer.publicId)})` : ''}</span><span class="muted">${escapeHtml(entry.phone || '')}</span></div>
          <div class="line"><span class="muted">${escapeHtml(entry.description || '')}</span><span class="muted">${escapeHtml(adminOrderDate(entry.reportAt))}</span></div>
        </div>`;
      });
    }

    document.getElementById('driverReportSub').textContent = `السائق: ${data.provider.name} (${data.provider.publicId || ''})`;
    document.getElementById('driverReportContent').innerHTML = html;
    document.getElementById('driverReportModal').classList.add('show');
  } catch (err) {
    alert('حدث خطأ في تحميل تقرير السائق');
  }
}

function closeDriverReport() {
  document.getElementById('driverReportModal').classList.remove('show');
}

async function toggleDriverAvailability(driverId, currentAvailability) {
  const nextAvailability = String(currentAvailability) !== 'true';
  try {
    const res = await adminFetch(`/admin/drivers/${encodeURIComponent(driverId)}/availability`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: nextAvailability }),
    });
    const data = await res.json();
    alert(data.success ? (nextAvailability ? 'تم جعل السائق متاحاً' : 'تم جعل السائق غير متاح') : (data.message || 'تعذر تحديث حالة التوفر'));
    searchDriver();
    loadDriversList();
  } catch (err) {
    alert('تعذر تحديث حالة التوفر');
  }
}

document.getElementById('orderSearchBtn').addEventListener('click', loadOrders);
document.getElementById('orderSearchInput').addEventListener('keypress', e => { if (e.key === 'Enter') loadOrders(); });
document.getElementById('orderAreaFilter').addEventListener('keypress', e => { if (e.key === 'Enter') loadOrders(); });
document.getElementById('orderStatusFilter').addEventListener('change', loadOrders);
document.getElementById('orderTypeFilter').addEventListener('change', loadOrders);


// ================================================
// 20. قوائم السائقين والمستخدمين أسفل شريط البحث
// ================================================
function adminAccountStatusLabel(status) {
  const map = {
    active: 'نشط',
    inactive: 'غير نشط',
    blocked: 'مجمد',
    pending: 'قيد المراجعة',
  };
  return map[status] || status || 'غير محدد';
}

function adminAccountStatusBadge(status) {
  const normalized = status === 'blocked' ? 'cancelled' : (status === 'active' ? 'completed' : 'pending');
  return `<span class="order-status-badge ${normalized}">${escapeHtml(adminAccountStatusLabel(status))}</span>`;
}

async function loadDriversList() {
  const container = document.getElementById('driversList');
  if (!container) return;

  try {
    const res = await adminFetch('/admin/drivers');
    const drivers = await res.json();

    if (!Array.isArray(drivers)) {
      container.innerHTML = `<p data-presentation="p030">${escapeHtml(drivers.error || 'تعذر تحميل السائقين')}</p>`;
      container.classList.add('show');
      return;
    }

    if (drivers.length === 0) {
      container.innerHTML = '<p data-presentation="p030">لا يوجد سائقون مسجلون.</p>';
      container.classList.add('show');
      return;
    }

    const rows = drivers.map((driver) => {
      const id = escapeHtml(String(driver._id));
      const busy = driver.blockedUntil && new Date(driver.blockedUntil) > new Date();
      const availability = driver.isAvailable
        ? '<span class="order-status-badge completed">متاح</span>'
        : '<span class="order-status-badge cancelled">غير متاح</span>';
      return `<tr>
        <td><strong>${escapeHtml(driver.fullName || 'غير محدد')}</strong>${driver.publicId ? `<br><small>ID ${escapeHtml(driver.publicId)}</small>` : ''}</td>
        <td>${escapeHtml(driver.phone || '')}</td>
        <td>${escapeHtml(driver.governorate || 'غير محدد')}</td>
        <td>${escapeHtml(driver.city || driver.area || 'غير محدد')}</td>
        <td>${escapeHtml(providerServiceTypesLabel(driver.serviceTypes))}</td>
        <td>${adminAccountStatusBadge(driver.status)}</td>
        <td>${availability}${busy ? ' <span class="order-status-badge pending">مشغول</span>' : ''}</td>
        <td><button class="order-action-btn details" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="selectDriverFromList" data-admin-arg-count="1" data-admin-arg-1="${id}"><i class="fas fa-eye"></i> عرض</button></td>
      </tr>`;
    }).join('');

    container.innerHTML = `<h4 data-presentation="p017">قائمة السائقين</h4>
      <table class="orders-table"><thead><tr><th>السائق</th><th>الجوال</th><th>المحافظة</th><th>المدينة / القرية</th><th>نوع الخدمة</th><th>الحالة</th><th>التوفر</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table>`;
    container.classList.add('show');
  } catch (err) {
    container.innerHTML = '<p data-presentation="p030">حدث خطأ في تحميل السائقين.</p>';
    container.classList.add('show');
  }
}

async function loadUsersList() {
  const container = document.getElementById('usersList');
  if (!container) return;

  try {
    const res = await adminFetch('/admin/users');
    const users = await res.json();

    if (!Array.isArray(users)) {
      container.innerHTML = `<p data-presentation="p030">${escapeHtml(users.error || 'تعذر تحميل المستخدمين')}</p>`;
      container.classList.add('show');
      return;
    }

    if (users.length === 0) {
      container.innerHTML = '<p data-presentation="p030">لا يوجد مستخدمون مسجلون.</p>';
      container.classList.add('show');
      return;
    }

    const rows = users.map((user) => {
      const id = escapeHtml(String(user._id));
      return `<tr>
        <td><strong>${escapeHtml(user.fullName || 'غير محدد')}</strong>${user.publicId ? `<br><small>ID ${escapeHtml(user.publicId)}</small>` : ''}</td>
        <td>${escapeHtml(user.email || '')}</td>
        <td>${escapeHtml(user.phone || '')}</td>
        <td>${escapeHtml(user.governorate || 'غير محدد')}</td>
        <td>${escapeHtml(user.city || user.area || 'غير محدد')}</td>
        <td>${adminAccountStatusBadge(user.status)}</td>
        <td><button class="order-action-btn details" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="selectUserFromList" data-admin-arg-count="1" data-admin-arg-1="${id}"><i class="fas fa-eye"></i> عرض</button></td>
      </tr>`;
    }).join('');

    container.innerHTML = `<h4 data-presentation="p017">قائمة المستخدمين</h4>
      <table class="orders-table"><thead><tr><th>المستخدم</th><th>البريد</th><th>الجوال</th><th>المحافظة</th><th>المدينة / القرية</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${rows}</tbody></table>`;
    container.classList.add('show');
  } catch (err) {
    container.innerHTML = '<p data-presentation="p030">حدث خطأ في تحميل المستخدمين.</p>';
    container.classList.add('show');
  }
}

function selectDriverFromList(id) {
  const input = document.getElementById('driverSearchInput');
  if (input) input.value = id;
  searchDriver();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectUserFromList(id) {
  const input = document.getElementById('userSearchInput');
  if (input) input.value = id;
  searchUser();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeDocuments() { document.getElementById('documentsModal').classList.remove('show'); }
document.getElementById('documentsModal').addEventListener('click', function (e) { if (e.target === this) closeDocuments(); });

function closeReport() { document.getElementById('reportModal').classList.remove('show'); }
function closeUserOrders() { document.getElementById('userOrdersModal').classList.remove('show'); }

function closeReportDetail() {
  document.getElementById('reportDetailModal').classList.remove('show');
  currentReportType = null;
  currentReportId = null;
}
document.getElementById('reportDetailModal').addEventListener('click', function (e) { if (e.target === this) closeReportDetail(); });

// ================================================
// 16. مودال القوائم الإحصائية
// ================================================
async function openListModal(type, filter, title) {
  const modal = document.getElementById('listModal');
  const titleEl = document.getElementById('listModalTitle');
  const subEl = document.getElementById('listModalSub');
  const content = document.getElementById('listModalContent');

  if (!modal || !titleEl || !subEl || !content) return;

  titleEl.textContent = title || 'القائمة';

  if (type === 'payouts') {
    modal.classList.add('show');
    content.innerHTML = '<p>جاري التحميل...</p>';

    try {
      const res = await adminFetch('/admin/commissions');
      const data = await res.json();
      const drivers = (data.driverRows || []).filter(
        (driver) =>
          driver.paymentStatus !== 'paid' && Number(driver.commission) > 0,
      );

      subEl.textContent =
        'إجمالي المستحقات: ' +
        (Number(data.totalUnpaid) || 0).toLocaleString('en-US') +
        ' شيكل';

      if (drivers.length === 0) {
        content.innerHTML = '<p>لا يوجد سائقون مستحقون للدفع حالياً.</p>';
        return;
      }

      const rows = drivers
        .map(
          (driver) => `
        <tr>
          <td><strong>${escapeHtml(driver.name || 'غير محدد')}</strong><br><small>${escapeHtml(driver.driverId || '')}</small></td>
          <td>${escapeHtml(driver.phone || 'غير متوفر')}</td>
          <td>${escapeHtml(String(driver.commission))} شيكل</td>
          <td><button class="action-btn pay-now" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="markPaid" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(driver._id))}">تم دفع المستحقات</button></td>
        </tr>`,
        )
        .join('');

      content.innerHTML = `
        <table class="orders-table">
          <thead>
            <tr>
              <th>السائق</th>
              <th>الجوال</th>
              <th>المستحق</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    } catch (err) {
      content.innerHTML = '<p>حدث خطأ في تحميل المستحقات.</p>';
    }
    return;
  }

  if (type !== 'drivers') {
    subEl.textContent = 'تفاصيل الأعضاء';
    content.innerHTML = '<p>تُدار قوائم المستخدمين من صفحة المستخدمين.</p>';
    modal.classList.add('show');
    return;
  }

  const isInactive = filter === 'inactive';
  const isActive = filter === 'active';

  subEl.textContent = isInactive
    ? 'السائقون الذين أوقفوا استقبال الطلبات'
    : isActive
      ? 'السائقون المتاحون لاستقبال الطلبات'
      : 'جميع السائقين';

  content.innerHTML = '<p>جاري التحميل...</p>';
  modal.classList.add('show');

  try {
    const res = await adminFetch('/admin/drivers');
    const drivers = await res.json();

    if (!Array.isArray(drivers)) {
      content.innerHTML = '<p>تعذر تحميل قائمة السائقين.</p>';
      return;
    }

    const filtered = drivers.filter((driver) => {
      if (driver.deleted === true) return false;
      if (filter === 'all') return true;
      if (String(driver.status) !== 'active') return false;
      const available = driver.isAvailable !== false;
      return filter === 'active' ? available : !available;
    });

    if (filtered.length === 0) {
      content.innerHTML = isInactive
        ? '<p>لا يوجد سائقون أوقفوا استقبال الطلبات حالياً.</p>'
        : '<p>لا يوجد سائقون في هذه القائمة.</p>';
      return;
    }

    const rows = filtered.map((driver) => {
      const available = driver.isAvailable !== false;
      const availability = available
        ? '<span class="order-status-badge completed">متاح</span>'
        : '<span class="order-status-badge cancelled">غير متاح</span>';
      return `<tr>
        <td><strong>${escapeHtml(driver.fullName || 'غير محدد')}</strong>${driver.publicId ? `<br><small>ID ${escapeHtml(driver.publicId)}</small>` : ''}</td>
        <td>${escapeHtml(driver.phone || '')}</td>
        <td>${escapeHtml(driver.area || 'غير محدد')}</td>
        <td>${availability}</td>
        <td>${adminAccountStatusBadge(driver.status)}</td>
      </tr>`;
    }).join('');

    content.innerHTML = `
      <table class="orders-table">
        <thead>
          <tr>
            <th>السائق</th>
            <th>الجوال</th>
            <th>المنطقة</th>
            <th>استقبال الطلبات</th>
            <th>حالة الحساب</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (err) {
    content.innerHTML = '<p>حدث خطأ في تحميل القائمة.</p>';
  }
}

function closeListModal() { document.getElementById('listModal').classList.remove('show'); }
document.getElementById('listModal').addEventListener('click', function (e) { if (e.target === this) closeListModal(); });

// ================================================
// 17. إعدادات كلمة المرور
// ================================================
function openResetPassword() {
  document.getElementById('resetPasswordModal').classList.add('show');
  document.getElementById('currentPassword').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('confirmPassword').value = '';
  document.getElementById('resetMsg').className = 'msg';
  document.getElementById('resetMsg').textContent = '';
}

function closeResetPassword() {
  document.getElementById('resetPasswordModal').classList.remove('show');
}
document.getElementById('resetPasswordModal').addEventListener('click', function (e) {
  if (e.target === this) closeResetPassword();
});

async function handleResetPassword() {
  const current = document.getElementById('currentPassword').value.trim();
  const newPass = document.getElementById('newPassword').value.trim();
  const confirmPass = document.getElementById('confirmPassword').value.trim();
  const msgEl = document.getElementById('resetMsg');

  if (!current || !newPass || !confirmPass) {
    msgEl.className = 'msg error';
    msgEl.textContent = 'الرجاء ملء جميع الحقول.';
    return;
  }
  if (newPass.length < 12) {
    msgEl.className = 'msg error';
    msgEl.textContent = 'كلمة المرور الجديدة يجب أن تكون 12 حرفاً على الأقل.';
    return;
  }
  if (newPass !== confirmPass) {
    msgEl.className = 'msg error';
    msgEl.textContent = 'كلمة المرور وتأكيدها غير متطابقين.';
    return;
  }

  try {
    const res = await adminFetch('/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: newPass, confirmPassword: confirmPass })
    });
    const data = await res.json();
    if (data.success) {
      msgEl.className = 'msg success';
      msgEl.textContent = 'تم تغيير كلمة المرور بنجاح!';
      setTimeout(() => { closeResetPassword(); }, 2000);
    } else {
      msgEl.className = 'msg error';
      msgEl.textContent = data.message;
    }
  } catch (err) {
    msgEl.className = 'msg error';
    msgEl.textContent = 'حدث خطأ في الاتصال';
  }
}

// ================================================
// 18. المصادقة الثنائية
// ================================================
async function manageTwoFactor() {
  try {
    const statusResponse = await adminFetch('/admin/2fa/status');
    const status = await statusResponse.json();

    if (!status.success) {
      alert(status.message || 'تعذر قراءة حالة المصادقة الثنائية');
      return;
    }

    if (status.enabled) {
      const password = prompt('أدخل كلمة مرور المدير لتعطيل المصادقة الثنائية:');

      if (password === null) return;

      const code = prompt('أدخل رمز المصادقة أو رمز استرداد:');

      if (code === null) return;

      const response = await adminFetch('/admin/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, code }),
      });
      const result = await response.json();

      alert(result.message || (result.success ? 'تم التعطيل' : 'تعذر التعطيل'));
      return;
    }

    const setupResponse = await adminFetch('/admin/2fa/setup', {
      method: 'POST',
    });
    const setup = await setupResponse.json();

    if (!setup.success) {
      alert(setup.message || 'تعذر بدء إعداد المصادقة الثنائية');
      return;
    }

    alert(
      'أضف الحساب في تطبيق المصادقة باستخدام الرابط التالي:\n\n'
      + setup.otpauthUri
      + '\n\nأو أدخل السر يدوياً:\n'
      + setup.secret,
    );

    const code = prompt('أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة:');

    if (code === null) return;

    const enableResponse = await adminFetch('/admin/2fa/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const enabled = await enableResponse.json();

    if (!enabled.success) {
      alert(enabled.message || 'تعذر تفعيل المصادقة الثنائية');
      return;
    }

    alert(
      'تم تفعيل المصادقة الثنائية.\n\nاحفظ رموز الاسترداد في مكان آمن:\n\n'
      + (enabled.recoveryCodes || []).join('\n'),
    );
  } catch (err) {
    alert('حدث خطأ في الاتصال');
  }
}

// ================================================
// 18. الإعلانات
// ================================================
let adsCache = [];

function adAudienceLabel(audience) {
  switch (audience) {
    case 'customers':
      return 'الزبائن';
    case 'providers':
      return 'السائقون';
    default:
      return 'الجميع';
  }
}

function adStatusBadge(isActive) {
  return isActive
    ? '<span class="order-status-badge completed">نشط</span>'
    : '<span class="order-status-badge cancelled">متوقف</span>';
}

function formatAdDate(value) {
  if (!value) return 'دائم';

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';

  return date.toLocaleString('ar-EG', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function toDateTimeLocal(value) {
  if (!value) return '';

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';

  const pad = (number) => String(number).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setAdFormMessage(message, type = '') {
  const element = document.getElementById('adFormMsg');
  if (!element) return;

  element.textContent = message || '';
  element.className = `settings-message ${type}`.trim();
}

function resetAdForm() {
  const form = document.getElementById('adForm');
  if (!form) return;

  form.reset();
  form.dataset.editingId = '';
  document.getElementById('adTitle').value = '';
  document.getElementById('adBody').value = '';
  document.getElementById('adStartsAt').value = '';
  document.getElementById('adEndsAt').value = '';
  document.getElementById('adSortOrder').value = '0';
  document.getElementById('adAudience').value = 'all';
  document.getElementById('adIsActive').value = 'true';
  setAdFormMessage('');
}

async function loadAds() {
  const container = document.getElementById('adsList');
  if (!container) return;

  try {
    const response = await adminFetch('/admin/ads');
    const ads = await response.json();

    if (!Array.isArray(ads)) {
      container.innerHTML = '<p class="settings-message error">تعذر تحميل الإعلانات.</p>';
      return;
    }

    adsCache = ads;

    if (ads.length === 0) {
      container.innerHTML = '<p class="settings-message">لا توجد إعلانات بعد. أضف أول إعلان من النموذج أعلاه.</p>';
      return;
    }

    const rows = ads.map((ad) => {
      const firstImage =
        Array.isArray(ad.images) && ad.images.length > 0
          ? ad.images[0]
          : '';

      return `
      <tr>
        <td>${firstImage ? `<img class="ad-thumb" src="${escapeHtml(firstImage)}" alt="">` : ''}<strong>${escapeHtml(ad.title || 'بدون عنوان')}</strong><br><small>${escapeHtml(ad.body || '')}</small></td>
        <td>${escapeHtml(adAudienceLabel(ad.audience))}</td>
        <td>${adStatusBadge(ad.isActive)}</td>
        <td>${escapeHtml(formatAdDate(ad.startsAt))}<br><small>${escapeHtml(formatAdDate(ad.endsAt))}</small></td>
        <td>${escapeHtml(String(ad.sortOrder))}</td>
        <td>
          <div class="table-actions">
            <button class="action-btn info" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="editAd" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(ad._id))}">تعديل</button>
            <button class="action-btn ${ad.isActive ? 'warning' : 'success'}" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="toggleAd" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(ad._id))}">${ad.isActive ? 'إيقاف' : 'تفعيل'}</button>
            <button class="action-btn danger" data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="deleteAd" data-admin-arg-count="1" data-admin-arg-1="${escapeHtml(String(ad._id))}">حذف</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');

    container.innerHTML = `
      <h3><i class="fas fa-rectangle-ad"></i> كل الإعلانات</h3>
      <table class="commissions-table">
        <thead>
          <tr>
            <th>الإعلان</th>
            <th>الجهة</th>
            <th>الحالة</th>
            <th>الفترة</th>
            <th>الترتيب</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = '<p class="settings-message error">تعذر تحميل الإعلانات.</p>';
  }
}

function editAd(id) {
  const ad = adsCache.find((item) => String(item._id) === String(id));
  if (!ad) return;

  document.getElementById('adForm').dataset.editingId = String(ad._id);
  document.getElementById('adTitle').value = ad.title || '';
  document.getElementById('adImages').value = '';
  document.getElementById('adBody').value = ad.body || '';
  document.getElementById('adAudience').value = ad.audience || 'all';
  document.getElementById('adStartsAt').value = toDateTimeLocal(ad.startsAt);
  document.getElementById('adEndsAt').value = toDateTimeLocal(ad.endsAt);
  document.getElementById('adSortOrder').value = String(ad.sortOrder || 0);
  document.getElementById('adIsActive').value = ad.isActive ? 'true' : 'false';

  setAdFormMessage(
    `أنت تعدّل إعلاناً موجوداً${Array.isArray(ad.images) && ad.images.length > 0 ? ` (${ad.images.length} صورة حالية)` : ''}. اضغط حفظ الإعلان لتحديثه.`,
    'success',
  );
  document.getElementById('page-ads').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteAd(id) {
  if (!confirm('هل تريد حذف هذا الإعلان نهائياً؟')) return;

  try {
    const response = await adminFetch(`/admin/ads/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = await response.json();

    if (!data.success) {
      alert(data.message || 'تعذر حذف الإعلان');
      return;
    }

    resetAdForm();
    loadAds();
  } catch (err) {
    alert('حدث خطأ في الاتصال');
  }
}

async function toggleAd(id) {
  const ad = adsCache.find((item) => String(item._id) === String(id));
  if (!ad) return;

  try {
    const response = await adminFetch(`/admin/ads/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !ad.isActive }),
    });
    const data = await response.json();

    if (!data.success) {
      alert(data.message || 'تعذر تغيير حالة الإعلان');
      return;
    }

    loadAds();
  } catch (err) {
    alert('حدث خطأ في الاتصال');
  }
}

async function saveAd(event) {
  event.preventDefault();

  const title = document.getElementById('adTitle').value.trim();
  const body = document.getElementById('adBody').value.trim();
  const imageFiles = Array.from(document.getElementById('adImages').files || []);
  const audience = document.getElementById('adAudience').value;
  const startsAtValue = document.getElementById('adStartsAt').value;
  const endsAtValue = document.getElementById('adEndsAt').value;
  const sortOrder = Number(document.getElementById('adSortOrder').value || 0);
  const isActive = document.getElementById('adIsActive').value === 'true';

  const editingId = document.getElementById('adForm').dataset.editingId || '';
  const existingAd = adsCache.find((item) => String(item._id) === String(editingId));
  const existingImageCount = Array.isArray(existingAd?.images)
    ? existingAd.images.length
    : 0;

  if (imageFiles.length > 5) {
    setAdFormMessage('يمكن رفع 5 صور كحد أقصى للإعلان.', 'error');
    return;
  }

  if (!title && !body && imageFiles.length === 0 && existingImageCount === 0) {
    setAdFormMessage('أضف عنواناً أو نصاً أو صورة واحدة على الأقل.', 'error');
    return;
  }

  if (startsAtValue && endsAtValue && new Date(endsAtValue) <= new Date(startsAtValue)) {
    setAdFormMessage('تاريخ النهاية يجب أن يكون بعد تاريخ البداية.', 'error');
    return;
  }

  const payload = new FormData();
  payload.append('title', title);
  payload.append('body', body);
  payload.append('audience', audience);
  payload.append('isActive', isActive ? 'true' : 'false');
  payload.append('sortOrder', String(sortOrder));
  payload.append(
    'startsAt',
    startsAtValue ? new Date(startsAtValue).toISOString() : '',
  );
  payload.append(
    'endsAt',
    endsAtValue ? new Date(endsAtValue).toISOString() : '',
  );
  imageFiles.forEach((file) => payload.append('images', file));

  try {
    const response = await adminFetch(
      editingId
        ? `/admin/ads/${encodeURIComponent(editingId)}`
        : '/admin/ads',
      {
        method: editingId ? 'PUT' : 'POST',
        body: payload,
      },
    );
    const data = await response.json();

    if (!data.success) {
      setAdFormMessage(data.message || 'تعذر حفظ الإعلان.', 'error');
      return;
    }

    resetAdForm();
    document.getElementById('adForm').dataset.editingId = '';
    loadAds();
    setAdFormMessage('تم حفظ الإعلان بنجاح.', 'success');
  } catch (err) {
    setAdFormMessage('تعذر حفظ الإعلان.', 'error');
  }
}

const adForm = document.getElementById('adForm');
if (adForm) {
  adForm.addEventListener('submit', saveAd);
}

const adCancelEdit = document.getElementById('adCancelEdit');
if (adCancelEdit) {
  adCancelEdit.addEventListener('click', () => {
    const form = document.getElementById('adForm');
    if (form) form.dataset.editingId = '';
    resetAdForm();
  });
}

// ================================================
// 18. محادثات الدعم (Real-time)
// ================================================
let supportSocket = null;
let activeChatUserId = null;
let conversations = [];

function initSupportChat() {
  loadConversations();
  if (!supportSocket || !supportSocket.connected) connectSupportSocket();
}

function connectSupportSocket() {
  if (supportSocket) {
    if (!supportSocket.connected) supportSocket.connect();
    return;
  }

  supportSocket = io({ transports: ['websocket'], withCredentials: true });
  supportSocket.on('connect', () => console.log('Admin socket connected to support'));
  supportSocket.on('support_message', (data) => {
    const badge = document.getElementById('chatBadge');
    if (badge) {
      const current = parseInt(badge.textContent || '0');
      badge.textContent = current + 1;
      setInlineDisplay(badge, true);
    }
    if (currentChatTarget && String(currentChatTarget.id) === String(data.userId)) {
      refreshLegacyChat();
    }
    if (document.getElementById('page-support-chat').classList.contains('active-page')) {
      loadConversations();
      if (activeChatUserId === data.userId) appendChatMessage('user', data.text, data.createdAt);
    }
  });
}

async function loadConversations() {
  try {
    const res = await adminFetch('/api/chat/admin/conversations');
    conversations = await res.json();
    renderConversations();
    updateSupportBadge();
  } catch (err) { console.error('Load conversations:', err); }
}

function updateSupportBadge() {
  const badge = document.getElementById('chatBadge');
  if (!badge) return;

  const total = (conversations || []).reduce(
    (sum, conversation) => sum + (conversation.unread || 0),
    0,
  );

  badge.textContent = String(total);
  setInlineDisplay(badge, total > 0);
}

function renderConversations() {
  const container = document.getElementById('chatConversations');

  if (!conversations || conversations.length === 0) {
    container.innerHTML = '<p data-presentation="p006">لا توجد محادثات حالياً</p>';
    return;
  }

  container.innerHTML = '';

  conversations.forEach((conversation) => {
    const userId = String(conversation.userId || '');
    const userName = conversation.userName || 'Unknown';
    const initial = (userName || 'U')[0].toUpperCase();

    let role = 'مستخدم';
    if (conversation.userRole === 'provider') role = 'سائق';
    if (conversation.userRole === 'guest') role = 'زائر';

    const item = document.createElement('div');
    item.className =
      `conv-item ${activeChatUserId === userId ? 'active' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'conv-avatar';
    avatar.textContent = initial;

    const info = document.createElement('div');
    info.className = 'conv-info';

    const name = document.createElement('div');
    name.className = 'conv-name';
    name.textContent = userName;

    const preview = document.createElement('div');
    preview.className = 'conv-preview';
    preview.textContent = conversation.lastMessage || '';

    info.appendChild(name);
    info.appendChild(preview);

    item.appendChild(avatar);
    item.appendChild(info);

    if ((conversation.unread || 0) > 0) {
      const badge = document.createElement('div');
      badge.className = 'conv-badge';
      badge.textContent = String(conversation.unread);
      item.appendChild(badge);
    }

    item.addEventListener('click', () => {
      openSupportChat(
        userId,
        userName,
        conversation.userPublicId || '',
        role,
      );
    });

    container.appendChild(item);
  });
}

async function openSupportChat(
  userId,
  userName,
  userPublicId,
  role,
) {
  activeChatUserId = userId;
  renderConversations();

  const windowEl = document.getElementById('chatWindow');
  const isPublicContact = userId.startsWith('contact:');

  windowEl.innerHTML = isPublicContact
    ? `
      <div class="chat-header">
        <i class="fas fa-user-circle"></i>
        <span id="chatHeaderIdentity"></span>
        <button id="resolveChatButton" data-presentation="p031">
          <i class="fas fa-check"></i> حل المشكلة
        </button>
      </div>
      <div class="chat-messages" id="chatMessagesArea">
        <p data-presentation="p006">جاري التحميل...</p>
      </div>
      <div class="chat-input-area">
        <span data-presentation="p032">
          طلب تواصل من زائر — استخدم البريد الإلكتروني أو رقم الهاتف الظاهر في الرسالة للرد.
        </span>
      </div>
    `
    : `
      <div class="chat-header">
        <i class="fas fa-user-circle"></i>
        <span id="chatHeaderIdentity"></span>
        <button id="resolveChatButton" data-presentation="p031">
          <i class="fas fa-check"></i> حل المشكلة
        </button>
      </div>
      <div class="chat-messages" id="chatMessagesArea">
        <p data-presentation="p006">جاري التحميل...</p>
      </div>
      <div class="chat-input-area">
        <input
          type="text"
          id="adminChatInput"
          placeholder="اكتب ردك..."
        >
        <button id="adminChatSendButton">
          <i class="fas fa-paper-plane"></i> إرسال
        </button>
      </div>
    `;

  const identity =
    document.getElementById('chatHeaderIdentity');

  if (identity) {
    const publicIdText =
      userPublicId ? ` ID ${userPublicId}` : '';

    identity.textContent =
      `${userName}${publicIdText} (${role})`;
  }

  const resolveButton =
    document.getElementById('resolveChatButton');

  if (resolveButton) {
    resolveButton.addEventListener(
      'click',
      () => resolveChat(userId),
    );
  }

  if (!isPublicContact) {
    const input =
      document.getElementById('adminChatInput');

    const sendButton =
      document.getElementById('adminChatSendButton');

    if (input) {
      input.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
          sendAdminReply();
        }
      });
    }

    if (sendButton) {
      sendButton.addEventListener(
        'click',
        () => sendAdminReply(),
      );
    }
  }

  loadChatMessages(userId);
}

async function loadChatMessages(userId) {
  try {
    const res = await adminFetch(`/api/chat/admin/messages/${userId}`);
    const messages = await res.json();
    const area = document.getElementById('chatMessagesArea');
    area.innerHTML = '';
    messages.forEach(m => appendChatMessage(m.sender, m.text, m.createdAt));
    area.scrollTop = area.scrollHeight;

    const readRes = await adminFetch(
      `/api/chat/admin/messages/${userId}/read`,
      {
        method: 'POST',
      },
    );

    if (!readRes.ok) {
      console.error(
        `Mark-read failed with HTTP ${readRes.status}`,
      );
    } else {
      loadConversations();
    }
  } catch (err) { console.error(err); }
}

function appendChatMessage(sender, text, time) {
  const area = document.getElementById('chatMessagesArea');
  if (!area) return;

  const div = document.createElement('div');
  div.className = `chat-msg ${sender}`;

  const body = document.createElement('div');
  body.className = 'chat-text';
  body.textContent = text || '';

  const timeEl = document.createElement('div');
  timeEl.className = 'chat-time';
  timeEl.textContent = time
    ? new Date(time).toLocaleTimeString(
        'ar-EG',
        {
          hour: '2-digit',
          minute: '2-digit',
        },
      )
    : '';

  div.appendChild(body);
  div.appendChild(timeEl);

  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

async function sendAdminReply() {
  const input =
    document.getElementById('adminChatInput');

  if (
    !input
    || !activeChatUserId
    || activeChatUserId.startsWith('contact:')
  ) {
    return;
  }

  const text = input.value.trim();
  if (!text) return;

  input.value = '';

  try {
    const res = await adminFetch(
      `/api/chat/admin/reply/${activeChatUserId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      },
    );

    if (!res.ok) {
      throw new Error(
        `Reply failed with HTTP ${res.status}`,
      );
    }

    appendChatMessage(
      'admin',
      text,
      new Date().toISOString(),
    );
    loadConversations();
  } catch (err) {
    console.error(err);
  }
}

async function resolveChat(userId) {
  if (!confirm('هل أنت متأكد من حل هذه المشكلة؟ سيتم حذف جميع رسائل هذه المحادثة.')) return;
  try {
    await adminFetch(`/api/chat/admin/resolve/${userId}`, { method: 'DELETE' });
    activeChatUserId = null;
    document.getElementById('chatWindow').innerHTML = '<div class="chat-empty-state"><i class="fas fa-check-circle" data-presentation="p033"></i><p data-presentation="p008">تم حل المشكلة بنجاح</p></div>';
    loadConversations();
    setInlineDisplay(document.getElementById('chatBadge'), false);
    document.getElementById('chatBadge').textContent = '0';
  } catch (err) { console.error(err); }
}

function escapeHtml(value) {
  return String(
    value ?? '',
  )
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ================================================
// 19. طلبات تسجيل السائقين
// ================================================
function providerServiceTypesLabel(types) {
  const labels = {
    product: 'توصيل منتجات',
    people: 'توصيل ركاب',
    goods: 'نقل بضائع',
  };
  const values = Array.isArray(types) ? types : [];
  if (values.length === 0 || values.length === 3) {
    return 'جميع الخدمات';
  }
  return values.map((type) => labels[type] || type).join(' + ');
}

async function loadPendingProviders() {
  try {
    const res =
      await adminFetch(
        '/admin/drivers/pending',
      );

    const pending =
      await res.json();

    const badge =
      document.getElementById(
        'pendingBadge',
      );

    badge.textContent =
      pending.length;

    setInlineDisplay(
      badge,
      pending.length > 0,
    );

    if (pending.length === 0) {
      document
        .getElementById(
          'pendingProvidersContent',
        )
        .innerHTML =
          '<p data-presentation="p006">'
          + 'لا توجد طلبات تسجيل جديدة'
          + '</p>';

      return;
    }

    const reviewedPending =
      await Promise.all(
        pending.map(
          async (provider) => {
            try {
              const documentsResponse =
                await adminFetch(
                  `/admin/drivers/pending/${
                    encodeURIComponent(
                      String(
                        provider._id,
                      ),
                    )
                  }/documents`,
                );

              if (
                !documentsResponse.ok
              ) {
                return {
                  ...provider,
                  documentReview: {
                    documents: [],
                    complete: false,
                    unavailable: true,
                  },
                };
              }

              const documentReview =
                await documentsResponse.json();

              return {
                ...provider,
                documentReview: {
                  ...documentReview,
                  unavailable: false,
                },
              };
            } catch (_) {
              return {
                ...provider,
                documentReview: {
                  documents: [],
                  complete: false,
                  unavailable: true,
                },
              };
            }
          },
        ),
      );

    let rows = '';

    reviewedPending.forEach(
      (provider) => {
        const review =
          provider.documentReview
          || {
            documents: [],
            complete: false,
            unavailable: true,
          };

        const licenseWaived =
          provider.licenseNotAvailable === true
          || review.licenseNotAvailable === true;
        const canApprove = true;

        const documentStatusText =
          licenseWaived
            ? 'لا يملك رخصة'
            : (
                review.unavailable
                  ? 'لا توجد وثائق'
                  : (
                      review.complete
                        ? 'مكتملة'
                        : 'لا توجد وثائق مرفقة'
                    )
              );

        const statusClass =
          canApprove
            ? 'paid-badge'
            : 'unpaid-badge';

        const approveButton =
          canApprove
            ? (
                `<button class="action-btn success" `
                + `data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="approveProvider" `
                + `data-admin-arg-count="1" `
                + `data-admin-arg-1="${escapeHtml(String(provider._id))}" `
                + `data-presentation="p034">`
                + `<i class="fas fa-check"></i> قبول`
                + `</button>`
              )
            : (
                `<button class="action-btn success" `
                + `type="button" disabled `
                + `title="يجب اكتمال رخصة القيادة قبل القبول أو اختيار تسجيل بدون رخصة" `
                + `data-presentation="p034">`
                + `<i class="fas fa-check"></i> قبول`
                + `</button>`
              );

        rows +=
          `<tr>`
          + `<td><strong>${escapeHtml(provider.fullName)}</strong></td>`
          + `<td>${escapeHtml(provider.email)}</td>`
          + `<td>${escapeHtml(provider.phone)}</td>`
          + `<td>${escapeHtml(providerServiceTypesLabel(provider.serviceTypes))}</td>`
          + `<td>${escapeHtml(provider.governorate || 'غير محدد')}</td>`
          + `<td>${escapeHtml(provider.city || provider.area || 'غير محدد')}</td>`
          + `<td>${escapeHtml(new Date(provider.createdAt).toLocaleDateString('ar-EG'))}</td>`
          + `<td><span class="${statusClass}">${escapeHtml(documentStatusText)}</span></td>`
          + `<td>`
          + `<button class="action-btn info" `
          + `data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="viewPendingProviderDocuments" `
          + `data-admin-arg-count="2" `
          + `data-admin-arg-1="${escapeHtml(String(provider._id))}" `
          + `data-admin-arg-2="${escapeHtml(String(provider.fullName || ''))}" `
          + `data-presentation="p034">`
          + `<i class="fas fa-file-alt"></i> مراجعة الوثائق`
          + `</button>`
          + approveButton
          + `<button class="action-btn danger" `
          + `data-admin-capability="${escapeHtml(adminActionCapability || '')}" data-admin-action="rejectProvider" `
          + `data-admin-arg-count="1" `
          + `data-admin-arg-1="${escapeHtml(String(provider._id))}" `
          + `data-presentation="p034">`
          + `<i class="fas fa-times"></i> رفض`
          + `</button>`
          + `</td>`
          + `</tr>`;
      },
    );

    document
      .getElementById(
        'pendingProvidersContent',
      )
      .innerHTML =
        `<div class="commissions-table-container">`
        + `<h3>قائمة طلبات التسجيل</h3>`
        + `<table class="commissions-table">`
        + `<thead><tr>`
        + `<th>الاسم</th>`
        + `<th>البريد</th>`
        + `<th>الجوال</th>`
        + `<th>نوع الخدمة</th>`
        + `<th>المحافظة</th>`
        + `<th>المدينة / القرية</th>`
        + `<th>تاريخ التسجيل</th>`
        + `<th>الوثائق</th>`
        + `<th>الإجراءات</th>`
        + `</tr></thead>`
        + `<tbody>${rows}</tbody>`
        + `</table>`
        + `</div>`;
  } catch (err) {
    console.error(
      'Error loading pending providers:',
      err,
    );
  }
}

async function approveProvider(id) {
  try {
    const encodedId =
      encodeURIComponent(
        String(id),
      );

    // Driver document upload was removed from the mobile app, so new
    // applicants have no documents and the review list always enables
    // "Approve". Documents of older applicants can still be opened from the
    // review button; they no longer gate approval.
    if (
      !confirm(
        'هل أنت متأكد من قبول طلب هذا السائق؟',
      )
    ) {
      return;
    }

    const res =
      await adminFetch(
        `/admin/drivers/pending/${encodedId}/approve`,
        {
          method: 'POST',
        },
      );

    const data =
      await res.json();

    if (data.success) {
      alert(data.message);
      loadPendingProviders();
      loadDashboardStats();
    } else {
      alert(
        data.message
        || 'تعذر قبول المزود',
      );
    }
  } catch (_) {
    alert('حدث خطأ');
  }
}

async function rejectProvider(id) {
  if (!confirm('هل أنت متأكد من رفض طلب هذا السائق؟')) return;
  try {
    const res = await adminFetch(`/admin/drivers/pending/${id}/reject`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadPendingProviders();
    } else {
      alert(data.message);
    }
  } catch (err) { alert('حدث خطأ'); }
}

document.addEventListener('DOMContentLoaded', () => {
  loadDashboardStats();
  loadCommissions();
  loadAreasForDropdown();
  initSupportChat();
});

let adminAreasByGovernorate = {};

async function loadAreasForDropdown() {
  try {
    const res = await adminFetch('/data/areas.json');
    const data = await res.json();
    const states = Array.isArray(data.states) ? data.states : [];
    const governorateSelect = document.getElementById('driverGovernorateSelect');
    const areaSelect = document.getElementById('driverAreaSelect');
    if (!governorateSelect || !areaSelect) return;

    adminAreasByGovernorate = Object.fromEntries(
      states.map((state) => [
        state.name,
        Array.isArray(state.cities) ? state.cities : [],
      ]),
    );

    const groups = {
      'الضفة الغربية': ['القدس','رام الله والبيرة','الخليل','نابلس','بيت لحم','أريحا','سلفيت','جنين','طولكرم','قلقيلية','طوباس'],
      'قطاع غزة': ['غزة','خان يونس','رفح','دير البلح','شمال غزة'],
      'الداخل المحتل': ['حيفا','عكا','الناصرة','يافا'],
    };

    governorateSelect.innerHTML = '<option value="">اختر المحافظة...</option>';
    for (const [groupLabel, groupAreas] of Object.entries(groups)) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = groupLabel;
      for (const name of groupAreas) {
        if (!adminAreasByGovernorate[name]) continue;
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        optgroup.appendChild(option);
      }
      governorateSelect.appendChild(optgroup);
    }

    const populateCities = () => {
      const governorate = governorateSelect.value;
      areaSelect.innerHTML = '<option value="">اختر القرية أو المدينة...</option>';

      if (!governorate) {
        areaSelect.disabled = true;
        return;
      }

      areaSelect.disabled = false;
      const itself = document.createElement('option');
      itself.value = governorate;
      itself.textContent = `من ${governorate} نفسها`;
      areaSelect.appendChild(itself);

      for (const city of adminAreasByGovernorate[governorate] || []) {
        const option = document.createElement('option');
        option.value = city;
        option.textContent = city;
        areaSelect.appendChild(option);
      }
    };

    if (governorateSelect.dataset.changeBound !== '1') {
      governorateSelect.dataset.changeBound = '1';
      governorateSelect.addEventListener('change', populateCities);
    }

    governorateSelect.value = '';
    populateCities();
  } catch (_) {}
}
