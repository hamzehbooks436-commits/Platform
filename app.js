import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, remove, runTransaction, onValue } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const page = document.body.dataset.page;
const message = document.querySelector("#message");
const configured = !firebaseConfig.apiKey.startsWith("PASTE_");
if (!configured) setMessage("Firebase is not configured yet. Follow the setup instructions before testing.");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const h = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
const setMessage = text => { if (message) message.textContent = text; };
const usernameKey = value => value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
const accountEmail = user => `${usernameKey(user)}@platform.example`;
const isAdmin = async uid => (await get(ref(db, `admins/${uid}`))).val() === true;
const redirect = url => { window.location.href = url; };
let creatingAccount = false;
const stemSubjects = ["Physics", "Biology", "Chemistry", "Mathematics", "Computer Science", "Engineering", "Gardening", "Cooking"];
const literatureSubjects = ["English", "French", "History", "Art and design", "Detectivism and Mysteries"];
const allSubjects = [...stemSubjects, ...literatureSubjects];
const requiredSubjects = new Set(["Mathematics", "English", "French"]);
const examDates = ["November 2026", "January 2027", "June 2027"];
const validColour = value => /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#ffffff";
const validFontColour = value => /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#000000";
const validFontSize = value => [18, 24, 32, 40].includes(Number(value)) ? Number(value) : 24;
const formatJod = cents => `${(Number(cents || 0) / 100).toFixed(2)} JOD`;

function isLuhnValid(number) {
  return number.split("").reverse().reduce((sum, digit, index) => {
    let value = Number(digit); if (index % 2) value = value > 4 ? value * 2 - 9 : value * 2;
    return sum + value;
  }, 0) % 10 === 0;
}

function createMockCardNumber() {
  let number;
  do number = `9${Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join("")}`;
  while (isLuhnValid(number));
  return number;
}

async function createUniqueMockCard(user) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const cardNumber = createMockCardNumber();
    const reservation = await runTransaction(ref(db, `bankCardNumbers/${cardNumber}`), current => current === null ? user.uid : undefined);
    if (reservation.committed) return cardNumber;
  }
  throw new Error("A unique mock card could not be created. Please try again.");
}

async function ensureBankAccount(user, profile) {
  const current = (await get(ref(db, `users/${user.uid}/bank`))).val();
  if (current?.cardNumber) {
    await set(ref(db, `bankAccounts/${user.uid}`), { username: profile?.username || "User" });
    return current;
  }
  const cardNumber = await createUniqueMockCard(user);
  const account = {
    balanceCents: 1500,
    cardNumber,
    cardholder: profile?.name || profile?.username || "Platform User",
    expiry: `${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")}/${new Date().getFullYear() + 4}`,
    securityCode: String(Math.floor(Math.random() * 900) + 100),
    createdAt: Date.now()
  };
  const saved = await runTransaction(ref(db, `users/${user.uid}/bank`), value => value || account);
  const bank = saved.snapshot.val();
  await set(ref(db, `bankAccounts/${user.uid}`), { username: profile?.username || "User" });
  return bank;
}

async function applyAccountTheme(user) {
  const backgroundColor = validColour((await get(ref(db, `users/${user.uid}/preferences/backgroundColor`))).val());
  document.body.style.backgroundColor = backgroundColor;
  document.body.dataset.accountBackground = backgroundColor;
  return backgroundColor;
}

function readHomeworkPicture(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file."));
    if (file.size > 1.5 * 1024 * 1024) return reject(new Error("The picture must be smaller than 1.5 MB."));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The picture could not be read."));
    reader.readAsDataURL(file);
  });
}

function logOutLink() {
  document.querySelector("#logout")?.addEventListener("click", async event => {
    event.preventDefault();
    try { await signOut(auth); } finally { window.location.replace("index.html"); }
  });
}

async function requireUser(user, adminOnly = false) {
  if (!user) { redirect("index.html"); return null; }
  const profile = (await get(ref(db, `users/${user.uid}/profile`))).val();
  const admin = await isAdmin(user.uid);
  if (adminOnly && !admin) { redirect("home.html"); return null; }
  return { user, profile, admin };
}

function authPage() {
  onAuthStateChanged(auth, user => { if (user && !creatingAccount) redirect("home.html"); });
  document.querySelector("#login-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const username = usernameKey(document.querySelector("#login-user").value);
    if (!username) return setMessage("Use letters, numbers, dots, dashes, or underscores in the user name.");
    try { await signInWithEmailAndPassword(auth, accountEmail(username), document.querySelector("#login-password").value); redirect("home.html"); }
    catch { setMessage("The user name or password is not correct."); }
  });
  document.querySelector("#signup-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const name = document.querySelector("#signup-name").value.trim();
    const username = usernameKey(document.querySelector("#signup-user").value);
    const password = document.querySelector("#signup-password").value;
    const age = Number(document.querySelector("#signup-age").value);
    if (!name || !username || !Number.isInteger(age)) return setMessage("Please enter a name, a valid user name, and age.");
    try {
      creatingAccount = true;
      const credential = await createUserWithEmailAndPassword(auth, accountEmail(username), password);
      const reservation = await runTransaction(ref(db, `usernames/${username}`), current => current === null ? credential.user.uid : undefined);
      if (!reservation.committed) { await credential.user.delete(); creatingAccount = false; return setMessage("That user name is already used."); }
      await set(ref(db, `users/${credential.user.uid}/profile`), { name, username, age, createdAt: Date.now() });
      await set(ref(db, `users/${credential.user.uid}/property`), { placeName: "Not set", rent: 0, address: "Not set", size: "Not set" });
      creatingAccount = false;
      redirect("home.html");
    } catch (error) { creatingAccount = false; setMessage(error.code === "auth/email-already-in-use" ? "That user name is already used." : "Could not create the account. Passwords need at least 6 characters."); }
  });
}

async function homePage(user) {
  const data = await requireUser(user); if (!data) return;
  document.querySelector("#welcome").textContent = `Welcome, ${data.profile?.name || "User"}`;
  if (Number(data.profile?.age) > 19) document.querySelector("#school-link").remove();
  else document.querySelector("#school-page-link").href = "school.html";
  if (data.admin) document.querySelector("#admin-link").innerHTML = '- <a href="admin.html">Administrator home</a>';
  const color = document.body.dataset.accountBackground || await applyAccountTheme(user);
  const colourInput = document.querySelector("#background-color");
  colourInput.value = color;
  colourInput.addEventListener("input", () => { document.body.style.backgroundColor = colourInput.value; });
  document.querySelector("#background-form").addEventListener("submit", async event => {
    event.preventDefault(); const backgroundColor = colourInput.value;
    try {
      await set(ref(db, `users/${user.uid}/preferences/backgroundColor`), backgroundColor);
      document.body.style.backgroundColor = backgroundColor; setMessage("Your background colour was saved for all of your pages.");
    } catch { setMessage("Could not save the colour. Please try again."); }
  });
  logOutLink();
}

async function propertyPage(user) {
  const data = await requireUser(user); if (!data) return;
  const property = (await get(ref(db, `users/${user.uid}/property`))).val() || {};
  document.querySelector("#property-details").innerHTML = `<b>Place name:</b> ${h(property.placeName || "Not set")}<br><b>Rent per month:</b> ${h(property.rent || 0)}<br><b>Address:</b> ${h(property.address || "Not set")}<br><b>Size:</b> ${h(property.size || "Not set")}`;
}

async function bankPage(user) {
  const data = await requireUser(user); if (!data) return;
  let bank;
  try { bank = await ensureBankAccount(user, data.profile); }
  catch (error) { return setMessage(error.message); }
  const details = document.querySelector("#bank-details");
  const spacedNumber = String(bank.cardNumber || "").replace(/(.{4})/g, "$1 ").trim();
  details.innerHTML = `<b>Balance:</b> ${h(formatJod(bank.balanceCents))}<br><br><b>Mock Platform card</b><br>Cardholder: ${h(bank.cardholder)}<br>Card number: ${h(spacedNumber)}<br>Expiry: ${h(bank.expiry)}<br>Security code: ${h(bank.securityCode)}`;

  const accounts = (await get(ref(db, "bankAccounts"))).val() || {};
  const recipient = document.querySelector("#bank-recipient");
  recipient.innerHTML = `<option value="">Choose a user</option>${Object.entries(accounts).filter(([uid]) => uid !== user.uid).map(([uid, account]) => `<option value="${h(uid)}">${h(account.username || "User")}</option>`).join("")}`;
  if (recipient.options.length === 1) recipient.insertAdjacentHTML("afterend", "<br><small>Other users appear here after they open their Bank page once.</small>");

  document.querySelector("#send-money-form").addEventListener("submit", async event => {
    event.preventDefault();
    const recipientUid = recipient.value;
    const amountCents = Math.round(Number(document.querySelector("#bank-amount").value) * 100);
    if (!recipientUid || !Number.isSafeInteger(amountCents) || amountCents <= 0) return setMessage("Choose a user and enter a valid amount.");
    const debit = await runTransaction(ref(db, `users/${user.uid}/bank/balanceCents`), current => {
      const balance = Number(current || 0); return balance >= amountCents ? balance - amountCents : undefined;
    });
    if (!debit.committed) return setMessage("You do not have enough money for that transfer.");
    const transferId = push(ref(db, `bankTransfers/${recipientUid}`)).key;
    try {
      await set(ref(db, `bankTransfers/${recipientUid}/${transferId}`), { senderUid: user.uid, senderName: data.profile?.username || data.profile?.name || "User", recipientUid, amountCents, status: "pending", createdAt: Date.now() });
      setMessage(`${formatJod(amountCents)} was sent.`); event.target.reset(); location.reload();
    } catch (error) {
      await runTransaction(ref(db, `users/${user.uid}/bank/balanceCents`), current => Number(current || 0) + amountCents);
      setMessage("The transfer could not be sent, so your money was returned.");
    }
  });

  const incoming = (await get(ref(db, `bankTransfers/${user.uid}`))).val() || {}; const area = document.querySelector("#incoming-transfers"); area.innerHTML = "";
  const pending = Object.entries(incoming).filter(([, transfer]) => transfer?.status === "pending");
  if (!pending.length) area.textContent = "There is no money waiting for you.";
  pending.forEach(([id, transfer]) => {
    const row = document.createElement("div"); row.innerHTML = `<hr><b>${h(transfer.senderName || "User")}</b> sent you ${h(formatJod(transfer.amountCents))}. `;
    const receive = document.createElement("button"); receive.textContent = "Receive money"; receive.onclick = async () => {
      const claim = await runTransaction(ref(db, `bankTransfers/${user.uid}/${id}`), current => current?.status === "pending" ? { ...current, status: "received", receivedAt: Date.now() } : undefined);
      if (!claim.committed) return setMessage("This transfer has already been received.");
      await runTransaction(ref(db, `users/${user.uid}/bank/balanceCents`), current => Number(current || 0) + Number(transfer.amountCents || 0));
      setMessage(`${formatJod(transfer.amountCents)} was added to your balance.`); location.reload();
    };
    row.append(receive); area.append(row);
  });
}

async function propertyRequestPage(user) {
  const data = await requireUser(user); if (!data) return;
  const property = (await get(ref(db, `users/${user.uid}/property`))).val() || {};
  for (const key of ["placeName", "rent", "address", "size"]) document.querySelector(`#${key}`).value = property[key] ?? "";
  document.querySelector("#property-request-form").addEventListener("submit", async event => {
    event.preventDefault();
    const requestedProperty = { placeName: document.querySelector("#placeName").value.trim(), rent: Number(document.querySelector("#rent").value), address: document.querySelector("#address").value.trim(), size: document.querySelector("#size").value.trim() };
    await set(push(ref(db, "propertyEditRequests")), { uid: user.uid, userName: data.profile?.name || data.profile?.username, property: requestedProperty, requestedAt: Date.now() });
    setMessage("Your edit request was sent to the admin.");
  });
}

async function taxesPage(user) {
  const data = await requireUser(user); if (!data) return;
  const taxes = (await get(ref(db, `users/${user.uid}/taxes`))).val() || { status: "unpaid", amount: 0 };
  document.querySelector("#tax-details").innerHTML = `<b>Status:</b> ${h(taxes.status)}<br><b>Amount:</b> ${h(taxes.amount)}`;
  const form = (await get(ref(db, `users/${user.uid}/taxForm`))).val();
  const request = (await get(ref(db, `taxFormRequests/${user.uid}`))).val();
  const link = document.querySelector("#tax-form-link"); const requestForm = document.querySelector("#tax-form-request");
  if (form && taxes.status !== "paid") link.innerHTML = '- <a href="tax-form.html">Open your tax form and pay</a>';
  else if (request) link.textContent = "Your tax request is waiting for the admin.";
  else { link.textContent = "Send a tax request to the admin before you pay."; requestForm.hidden = false; }
  requestForm.addEventListener("submit", async event => {
    event.preventDefault();
    await set(ref(db, `taxFormRequests/${user.uid}`), { uid: user.uid, userName: data.profile?.name || data.profile?.username || "User", requestedAt: Date.now() });
    requestForm.hidden = true; link.textContent = "Your tax request was sent and is waiting for the admin.";
  });
}

async function userTaxFormPage(user) {
  const data = await requireUser(user); if (!data) return;
  const form = (await get(ref(db, `users/${user.uid}/taxForm`))).val();
  const taxes = (await get(ref(db, `users/${user.uid}/taxes`))).val() || {};
  const details = document.querySelector("#tax-form-details");
  if (!form || taxes.status === "paid") { details.textContent = "There is no unpaid tax form for you."; return; }
  details.innerHTML = `<b>Tax amount to pay:</b> ${h(form.amount)}`;
  document.querySelector("#tax-payment-link").innerHTML = '- <a href="tax-payment.html">Pay digitally with your Platform card</a>';
}

function mockCardMatches(bank) {
  const number = document.querySelector("#payment-card-number").value.replace(/\D/g, "");
  const expiry = document.querySelector("#payment-card-expiry").value.trim();
  const code = document.querySelector("#payment-card-code").value.trim();
  return number === String(bank.cardNumber) && expiry === String(bank.expiry) && code === String(bank.securityCode);
}

async function debitBankBalance(user, amountCents) {
  const result = await runTransaction(ref(db, `users/${user.uid}/bank/balanceCents`), current => {
    const balance = Number(current || 0); return balance >= amountCents ? balance - amountCents : undefined;
  });
  return result.committed;
}

async function taxPaymentPage(user) {
  const data = await requireUser(user); if (!data) return;
  const form = (await get(ref(db, `users/${user.uid}/taxForm`))).val(); const taxes = (await get(ref(db, `users/${user.uid}/taxes`))).val() || {};
  const details = document.querySelector("#tax-payment-details");
  if (!form || taxes.status === "paid") { details.textContent = "There is no unpaid tax form for you."; return; }
  const amountCents = Math.round(Number(form.amount) * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) { details.textContent = "This tax amount is invalid."; return; }
  const bank = await ensureBankAccount(user, data.profile); details.innerHTML = `<b>Tax to pay:</b> ${h(formatJod(amountCents))}<br><b>Available balance:</b> ${h(formatJod(bank.balanceCents))}`;
  const paymentForm = document.querySelector("#tax-card-form"); paymentForm.hidden = false;
  paymentForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!mockCardMatches(bank)) return setMessage("Use the mock card details shown on your Bank page.");
    if (!await debitBankBalance(user, amountCents)) return setMessage("You do not have enough money to pay this tax.");
    try {
      await Promise.all([set(ref(db, `users/${user.uid}/taxes/status`), "paid"), set(ref(db, `users/${user.uid}/taxes/paidAt`), Date.now())]);
      setMessage(`Tax payment of ${formatJod(amountCents)} was completed.`); paymentForm.hidden = true;
    } catch (error) {
      await runTransaction(ref(db, `users/${user.uid}/bank/balanceCents`), current => Number(current || 0) + amountCents);
      setMessage("The tax status could not be updated, so your money was returned.");
    }
  });
}

async function rentPaymentPage(user) {
  const data = await requireUser(user); if (!data) return;
  const property = (await get(ref(db, `users/${user.uid}/property`))).val() || {}; const amountCents = Math.round(Number(property.rent) * 100);
  const month = new Date().toISOString().slice(0, 7); const priorPayment = (await get(ref(db, `users/${user.uid}/rentPayments/${month}`))).val();
  const details = document.querySelector("#rent-payment-details");
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) { details.textContent = "Set a valid monthly rent in your property details first."; return; }
  if (priorPayment) { details.innerHTML = `<b>${h(month)}</b> rent of ${h(formatJod(priorPayment.amountCents))} has already been paid.`; return; }
  const bank = await ensureBankAccount(user, data.profile); details.innerHTML = `<b>${h(month)}</b> rent: ${h(formatJod(amountCents))}<br><b>Available balance:</b> ${h(formatJod(bank.balanceCents))}`;
  const paymentForm = document.querySelector("#rent-card-form"); paymentForm.hidden = false;
  paymentForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!mockCardMatches(bank)) return setMessage("Use the mock card details shown on your Bank page.");
    if (!await debitBankBalance(user, amountCents)) return setMessage("You do not have enough money to pay this rent.");
    try {
      await set(ref(db, `users/${user.uid}/rentPayments/${month}`), { amountCents, paidAt: Date.now() });
      setMessage(`Rent payment of ${formatJod(amountCents)} was completed.`); paymentForm.hidden = true;
    } catch (error) {
      await runTransaction(ref(db, `users/${user.uid}/bank/balanceCents`), current => Number(current || 0) + amountCents);
      setMessage("The rent payment could not be saved, so your money was returned.");
    }
  });
}

async function financesPage(user) {
  const data = await requireUser(user); if (!data) return;
  const [bank, property, taxes, taxForm] = await Promise.all([
    ensureBankAccount(user, data.profile), get(ref(db, `users/${user.uid}/property`)).then(snap => snap.val() || {}), get(ref(db, `users/${user.uid}/taxes`)).then(snap => snap.val() || { status: "unpaid", amount: 0 }), get(ref(db, `users/${user.uid}/taxForm`)).then(snap => snap.val())
  ]);
  const month = new Date().toISOString().slice(0, 7); const rentPayment = (await get(ref(db, `users/${user.uid}/rentPayments/${month}`))).val();
  const rentCents = Math.max(0, Math.round(Number(property.rent || 0) * 100)); const taxCents = Math.max(0, Math.round(Number(taxForm?.amount ?? taxes.amount ?? 0) * 100));
  const spacedNumber = String(bank.cardNumber || "").replace(/(.{4})/g, "$1 ").trim(); const area = document.querySelector("#finance-details");
  area.innerHTML = `<b>Bank balance:</b> ${h(formatJod(bank.balanceCents))}<br><b>Mock card:</b> ${h(spacedNumber)}<br>Cardholder: ${h(bank.cardholder)}<br>Expiry: ${h(bank.expiry)}<hr><b>Rent for ${h(month)}:</b> ${h(formatJod(rentCents))} — ${rentPayment ? "paid" : "needed"}<br>${rentPayment ? "" : '- <a href="rent-payment.html">Pay rent</a><br>'}<br><b>Taxes:</b> ${h(formatJod(taxCents))} — ${h(taxes.status || "unpaid")}<br>${taxForm && taxes.status !== "paid" ? '- <a href="tax-payment.html">Pay taxes</a>' : '- <a href="taxes.html">Open taxes</a>'}`;
}

async function schoolPage(user) {
  const data = await requireUser(user); if (!data) return;
  if (Number(data.profile?.age) > 19) return redirect("home.html");
  const school = (await get(ref(db, `users/${user.uid}/school`))).val();
  if (![...requiredSubjects].every(subject => school?.subjects?.[subject]?.taken)) return redirect("school-register.html");
  document.querySelector("#school-details").textContent = "Your subjects are saved.";
  document.querySelector("#school-links").hidden = false;
}

async function schoolRegisterPage(user) {
  const data = await requireUser(user); if (!data) return;
  if (Number(data.profile?.age) > 19) return redirect("home.html");
}

async function subjectsPage(user, subjects) {
  const data = await requireUser(user); if (!data) return;
  if (Number(data.profile?.age) > 19) return redirect("home.html");
  const saved = ((await get(ref(db, `users/${user.uid}/school/subjects`))).val()) || {};
  const rows = document.querySelector("#subject-rows");
  rows.innerHTML = subjects.map(subject => {
    const item = saved[subject] || {}; const required = requiredSubjects.has(subject);
    const options = examDates.map(date => `<option${item.examDate === date ? " selected" : ""}>${date}</option>`).join("");
    return `<tr><td>${h(subject)}</td><td><input type="checkbox" data-subject="${h(subject)}"${item.taken || required ? " checked" : ""}${required ? " disabled" : ""}></td><td><select data-date="${h(subject)}" required><option value="">Choose an exam date</option>${options}</select></td></tr>`;
  }).join("");
  document.querySelector("#subjects-form").addEventListener("submit", async event => {
    event.preventDefault(); const changes = {};
    subjects.forEach(subject => {
      const taken = requiredSubjects.has(subject) || rows.querySelector(`[data-subject="${subject}"]`).checked;
      changes[subject] = taken ? { taken: true, examDate: rows.querySelector(`[data-date="${subject}"]`).value } : null;
    });
    if (Object.values(changes).some(item => item?.taken && !item.examDate)) return setMessage("Choose one of the three exam dates for every selected subject.");
    await update(ref(db, `users/${user.uid}/school/subjects`), changes);
    await set(ref(db, `users/${user.uid}/school/registeredAt`), Date.now());
    setMessage("Your subjects were saved.");
  });
}

function selectedSubjects(school) {
  return Object.entries(school?.subjects || {}).filter(([, value]) => value?.taken).map(([subject]) => subject);
}

function homeworkQuestionHtml(question, index) {
  if (question.type === "matching") {
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
    const answers = pairs.map(pair => pair.right).sort(() => Math.random() - 0.5);
    return `<p>${index + 1}. ${h(question.text)}<br><small>Match each item with its answer.</small>${pairs.map((pair, pairIndex) => `<br>${h(pair.left)}: <select name="q${index}-${pairIndex}" required><option value="">Choose an answer</option>${answers.map(answer => `<option value="${h(answer)}">${h(answer)}</option>`).join("")}</select>`).join("")}</p>`;
  }
  return `<p>${index + 1}. ${h(question.text)}<br><select name="q${index}" required><option value="">Choose an answer</option>${Object.values(question.choices || {}).map(choice => `<option value="${h(choice)}">${h(choice)}</option>`).join("")}</select></p>`;
}

function homeworkAnswerText(answer) {
  if (answer && typeof answer === "object") return Object.entries(answer).map(([left, right]) => `${left} → ${right}`).join("; ");
  return String(answer ?? "");
}

async function homeworksPage(user) {
  const data = await requireUser(user); if (!data) return;
  const school = (await get(ref(db, `users/${user.uid}/school`))).val(); const taken = new Set(selectedSubjects(school));
  if (!taken.size) return redirect("school-register.html");
  const homework = (await get(ref(db, "homeworks"))).val() || {}; const area = document.querySelector("#homework-list"); area.innerHTML = "";
  const assignments = Object.entries(homework).filter(([, item]) => taken.has(item.subject));
  if (!assignments.length) area.textContent = "There are no homeworks for your selected subjects.";
  assignments.forEach(([id, item]) => {
    const box = document.createElement("div"); const questions = Object.values(item.questions || {});
    const style = item.style || {}; box.style.color = validFontColour(style.fontColor); box.style.fontSize = `${validFontSize(style.fontSize)}px`; box.style.backgroundColor = validColour(style.backgroundColor); box.style.padding = "10px";
    box.innerHTML = `<hr><b>${h(item.subject)}: ${h(item.title)}</b>${item.dueDate ? `<br><b>Due:</b> ${h(item.dueDate)}` : ""}<form id="work-${id}">${questions.map(homeworkQuestionHtml).join("")}<button>Submit homework</button></form><div id="result-${id}"></div>`;
    if (typeof item.picture === "string" && item.picture.startsWith("data:image/")) { const picture = document.createElement("img"); picture.src = item.picture; picture.alt = item.title || "Homework picture"; picture.style.maxWidth = "100%"; picture.style.maxHeight = "450px"; picture.style.display = "block"; picture.style.margin = "10px 0"; box.querySelector("form").before(picture); }
    area.append(box);
    const result = box.querySelector(`#result-${id}`);
    onValue(ref(db, `homeworkSubmissions/${id}/${user.uid}`), snap => {
      const submission = snap.val();
      if (!submission) return;
      result.innerHTML = submission.grade === undefined ? "Homework submitted. Waiting for the admin to review and grade it." : `<p><b>Overall grade: ${h(submission.grade)}%</b><br>Correct answers: ${h(Object.values(submission.correctAnswers || {}).map(homeworkAnswerText).join(", "))}</p>`;
    });
    box.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault(); const answers = {};
      questions.forEach((question, index) => {
        if (question.type === "matching") answers[index] = Object.fromEntries((question.pairs || []).map((pair, pairIndex) => [pair.left, box.querySelector(`[name="q${index}-${pairIndex}"]`).value]));
        else answers[index] = box.querySelector(`[name="q${index}"]`).value;
      });
      await set(ref(db, `homeworkSubmissions/${id}/${user.uid}`), { answers, submittedAt: Date.now() });
    });
  });
}

async function gradesPage(user) {
  const data = await requireUser(user); if (!data) return;
  const school = (await get(ref(db, `users/${user.uid}/school`))).val() || {}; const grades = school.grades || {}; const taken = selectedSubjects(school);
  document.querySelector("#grades-table").innerHTML = taken.length ? taken.map(subject => `<tr><td>${h(subject)}</td><td>${h(grades[subject] ?? "Not graded")}</td></tr>`).join("") : "<tr><td colspan=\"2\">Choose your subjects first.</td></tr>";
}

async function upcomingExamsPage(user) {
  const data = await requireUser(user); if (!data) return;
  const school = (await get(ref(db, `users/${user.uid}/school`))).val(); const taken = new Set(selectedSubjects(school));
  const exams = (await get(ref(db, "upcomingExams"))).val() || {}; const list = Object.values(exams).filter(exam => taken.has(exam.subject));
  document.querySelector("#exam-list").innerHTML = list.length ? list.map(exam => `<hr><b>${h(exam.subject)}</b><br>${h(exam.date)}<br>${h(exam.details)}`).join("") : "There are no upcoming exams for your selected subjects.";
}

function calendarMonth(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined, { month: "long", year: "numeric" });
}

async function calendarPage(user) {
  const data = await requireUser(user); if (!data) return;
  if (Number(data.profile?.age) > 19) return redirect("home.html");
  const school = (await get(ref(db, `users/${user.uid}/school`))).val();
  if (![...requiredSubjects].every(subject => school?.subjects?.[subject]?.taken)) return redirect("school-register.html");
  const taken = new Set(selectedSubjects(school)); const grouped = new Map();
  const add = (month, item) => { if (!grouped.has(month)) grouped.set(month, []); grouped.get(month).push(item); };
  Object.entries(school.subjects || {}).filter(([, subject]) => subject?.taken && subject.examDate).forEach(([subject, item]) => add(item.examDate, `${subject} exam period`));
  const [exams, homeworks] = await Promise.all([get(ref(db, "upcomingExams")).then(snap => snap.val() || {}), get(ref(db, "homeworks")).then(snap => snap.val() || {})]);
  Object.values(exams).filter(exam => taken.has(exam.subject) && exam.date).forEach(exam => add(calendarMonth(exam.date), `${exam.subject} exam — ${exam.date}${exam.details ? `: ${exam.details}` : ""}`));
  Object.values(homeworks).filter(homework => taken.has(homework.subject) && homework.dueDate).forEach(homework => add(calendarMonth(homework.dueDate), `Homework due: ${homework.subject} — ${homework.title} (${homework.dueDate})`));
  const area = document.querySelector("#calendar-list");
  const months = [...grouped.keys()].sort((a, b) => new Date(a) - new Date(b));
  area.innerHTML = months.length ? months.map(month => `<hr><b>${h(month)}</b><br>${grouped.get(month).map(item => `- ${h(item)}`).join("<br>")}`).join("") : "There are no exam dates or homework due dates yet.";
}

async function announcementsPage(user) {
  const data = await requireUser(user); if (!data) return;
  if (Number(data.profile?.age) > 19) return redirect("home.html");
  const school = (await get(ref(db, `users/${user.uid}/school`))).val();
  if (![...requiredSubjects].every(subject => school?.subjects?.[subject]?.taken)) return redirect("school-register.html");
  const announcements = Object.values((await get(ref(db, "announcements"))).val() || {}).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const area = document.querySelector("#announcement-list");
  area.innerHTML = announcements.length ? announcements.map(item => `<hr><b>${h(item.title)}</b><br>${h(item.details).replace(/\n/g, "<br>")}<br><small>${h(new Date(item.createdAt).toLocaleString())}</small>`).join("") : "There are no announcements yet.";
}

async function adminAnnouncementsPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  document.querySelector("#announcement-form").addEventListener("submit", async event => {
    event.preventDefault();
    await set(push(ref(db, "announcements")), { title: document.querySelector("#announcement-title").value.trim(), details: document.querySelector("#announcement-details").value.trim(), createdAt: Date.now() });
    setMessage("Announcement posted."); event.target.reset(); location.reload();
  });
  const announcements = (await get(ref(db, "announcements"))).val() || {}; const area = document.querySelector("#admin-announcement-list"); area.innerHTML = "";
  const entries = Object.entries(announcements).sort(([, a], [, b]) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  if (!entries.length) area.textContent = "There are no announcements yet.";
  entries.forEach(([id, item]) => { const row = document.createElement("div"); row.innerHTML = `<hr><b>${h(item.title)}</b><br>${h(item.details).replace(/\n/g, "<br>")}<br>`; const removeButton = document.createElement("button"); removeButton.textContent = "Remove"; removeButton.onclick = async () => { await remove(ref(db, `announcements/${id}`)); location.reload(); }; row.append(removeButton); area.append(row); });
}

async function propertyRequestsPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  const requests = (await get(ref(db, "propertyEditRequests"))).val() || {};
  const area = document.querySelector("#requests"); area.innerHTML = "";
  if (!Object.keys(requests).length) area.textContent = "There are no property edit requests.";
  Object.entries(requests).forEach(([id, request]) => {
    const p = request.property || {}; const box = document.createElement("div");
    box.innerHTML = `<hr><b>${h(request.userName)}</b><br>Place: ${h(p.placeName)}<br>Rent: ${h(p.rent)}<br>Address: ${h(p.address)}<br>Size: ${h(p.size)}<br>`;
    const accept = document.createElement("button"); accept.textContent = "Accept and edit property"; accept.onclick = async () => { await set(ref(db, `users/${request.uid}/property`), p); await remove(ref(db, `propertyEditRequests/${id}`)); location.reload(); };
    const deny = document.createElement("button"); deny.textContent = "Deny"; deny.onclick = async () => { await remove(ref(db, `propertyEditRequests/${id}`)); location.reload(); };
    box.append(accept, document.createTextNode(" "), deny); area.append(box);
  });
}

async function taxFormsPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  const formRequests = (await get(ref(db, "taxFormRequests"))).val() || {}; const requests = (await get(ref(db, "taxPaymentRequests"))).val() || {}; const users = (await get(ref(db, "users"))).val() || {}; const area = document.querySelector("#requests"); area.innerHTML = "";
  if (!Object.keys(formRequests).length && !Object.keys(requests).length) area.textContent = "There are no tax form requests.";
  Object.entries(formRequests).forEach(([id, request]) => {
    const amount = Number(users[request.uid]?.taxes?.amount || 0); const box = document.createElement("div"); box.innerHTML = `<hr><b>${h(request.userName)}</b> requested a tax form for ${h(amount)}.<br>`;
    const accept = document.createElement("button"); accept.textContent = "Accept and issue tax form"; accept.onclick = async () => { await update(ref(db), { [`users/${request.uid}/taxes`]: { amount, status: "unpaid" }, [`users/${request.uid}/taxForm`]: { amount, issuedAt: Date.now() } }); await remove(ref(db, `taxFormRequests/${id}`)); location.reload(); };
    const deny = document.createElement("button"); deny.textContent = "Deny"; deny.onclick = async () => { await remove(ref(db, `taxFormRequests/${id}`)); location.reload(); };
    box.append(accept, document.createTextNode(" "), deny); area.append(box);
  });
  Object.entries(requests).forEach(([id, request]) => {
    const box = document.createElement("div"); box.innerHTML = `<hr><b>${h(request.userName)}</b> sent a tax payment request for ${h(request.amount)}.<br>`;
    const accept = document.createElement("button"); accept.textContent = "Accept: mark paid"; accept.onclick = async () => { await update(ref(db, `users/${request.uid}/taxes`), { status: "paid" }); await remove(ref(db, `users/${request.uid}/taxForm`)); await remove(ref(db, `taxPaymentRequests/${id}`)); location.reload(); };
    const deny = document.createElement("button"); deny.textContent = "Deny"; deny.onclick = async () => { await remove(ref(db, `taxPaymentRequests/${id}`)); location.reload(); };
    box.append(accept, document.createTextNode(" "), deny); area.append(box);
  });
}

async function taxSettingsPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  const users = (await get(ref(db, "users"))).val() || {}; const area = document.querySelector("#users"); area.innerHTML = "";
  Object.entries(users).forEach(([uid, record]) => {
    const box = document.createElement("div"); const tax = record.taxes || { status: "unpaid", amount: 0 };
    box.innerHTML = `<hr><b>${h(record.profile?.name || record.profile?.username || "User")}</b><br>Amount: <input type="number" min="0" value="${h(tax.amount)}"> Status: <select><option value="unpaid">unpaid</option><option value="paid">paid</option></select> `;
    box.querySelector("select").value = tax.status;
    const save = document.createElement("button"); save.textContent = "Save"; save.onclick = async () => { await set(ref(db, `users/${uid}/taxes`), { amount: Number(box.querySelector("input").value), status: box.querySelector("select").value }); setMessage("Tax settings saved."); };
    box.append(save); area.append(box);
  });
}

async function schoolRecordsPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  const users = (await get(ref(db, "users"))).val() || {}; const area = document.querySelector("#records"); area.innerHTML = "";
  const registered = Object.values(users).filter(record => record.school?.registeredAt);
  area.innerHTML = registered.length ? registered.map(record => `<hr><b>${h(record.profile?.name || record.profile?.username)}</b><br>Age: ${h(record.profile?.age)}<br>Subjects: ${h(selectedSubjects(record.school).join(", ") || "None yet")}`).join("") : "There are no school registrations.";
}

function addSubjectOptions(element) {
  element.innerHTML = allSubjects.map(subject => `<option>${h(subject)}</option>`).join("");
}

async function adminHomeworksPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  addSubjectOptions(document.querySelector("#homework-subject"));
  const questions = document.querySelector("#question-fields");
  let questionCount = 0;
  const addQuestion = () => {
    questionCount += 1;
    const number = questionCount;
    const required = number === 1 ? " required" : "";
    const editor = document.createElement("div");
    editor.innerHTML = `<hr><b>Question ${number}${number === 1 ? " (required)" : " (optional)"}</b><br>Type: <select id="question-type-${number}"><option value="multiple-choice">Multiple choice</option><option value="matching">Matching</option></select><br>Question: <input id="question-${number}"${required}><br><span id="question-help-${number}">Choices (one per line):<br><textarea id="choices-${number}" rows="4" cols="35"${required}></textarea><br>Correct answer: <input id="answer-${number}"></span>`;
    questions.append(editor);
    editor.querySelector("select").addEventListener("change", event => {
      const matching = event.target.value === "matching";
      editor.querySelector(`#question-help-${number}`).innerHTML = matching ? `Matching pairs (one per line, use <b>left | right</b>):<br><textarea id="choices-${number}" rows="4" cols="35"${required}></textarea>` : `Choices (one per line):<br><textarea id="choices-${number}" rows="4" cols="35"${required}></textarea><br>Correct answer: <input id="answer-${number}">`;
    });
  };
  [1, 2, 3].forEach(addQuestion);
  document.querySelector("#add-question").addEventListener("click", addQuestion);
  document.querySelector("#homework-form").addEventListener("submit", async event => {
    event.preventDefault(); const savedQuestions = []; const answers = [];
    for (let number = 1; number <= questionCount; number++) {
      const text = document.querySelector(`#question-${number}`).value.trim(); if (!text) continue;
      const choices = document.querySelector(`#choices-${number}`).value.split("\n").map(value => value.trim()).filter(Boolean);
      const type = document.querySelector(`#question-type-${number}`).value;
      if (type === "matching") {
        const pairs = choices.map(value => value.split("|").map(part => part.trim())).filter(parts => parts.length === 2 && parts[0] && parts[1]);
        if (pairs.length < 2 || pairs.length !== choices.length) return setMessage(`Matching question ${number} needs at least two pairs, one left item and one right item on every line, separated by |.`);
        const matchingAnswers = Object.fromEntries(pairs);
        savedQuestions.push({ type, text, pairs: pairs.map(([left, right]) => ({ left, right })) }); answers.push(matchingAnswers);
      } else {
        const answer = document.querySelector(`#answer-${number}`).value.trim();
        if (choices.length < 2 || !choices.includes(answer)) return setMessage(`Question ${number} needs at least two choices, and its correct answer must exactly match one choice.`);
        savedQuestions.push({ type, text, choices }); answers.push(answer);
      }
    }
    if (!savedQuestions.length) return setMessage("Add at least one question.");
    let picture;
    try { picture = await readHomeworkPicture(document.querySelector("#homework-picture").files[0]); }
    catch (error) { return setMessage(error.message); }
    const style = { fontColor: document.querySelector("#homework-font-color").value, fontSize: validFontSize(document.querySelector("#homework-font-size").value), backgroundColor: document.querySelector("#homework-background-color").value };
    const id = push(ref(db, "homeworks")).key;
    await update(ref(db), { [`homeworks/${id}`]: { subject: document.querySelector("#homework-subject").value, title: document.querySelector("#homework-title").value.trim(), dueDate: document.querySelector("#homework-due-date").value, questions: savedQuestions, picture, style, createdAt: Date.now() }, [`homeworkAnswerKeys/${id}`]: { answers } });
    setMessage("Homework was created."); document.querySelector("#homework-form").reset(); location.reload();
  });
  const items = (await get(ref(db, "homeworks"))).val() || {}; const users = (await get(ref(db, "users"))).val() || {}; const area = document.querySelector("#admin-homework-list"); area.innerHTML = "";
  if (!Object.keys(items).length) area.textContent = "No homeworks yet.";
  for (const [id, item] of Object.entries(items)) {
    const submissions = (await get(ref(db, `homeworkSubmissions/${id}`))).val() || {}; const answerKey = (await get(ref(db, `homeworkAnswerKeys/${id}`))).val() || {}; const box = document.createElement("div");
    box.innerHTML = `<hr><b>${h(item.subject)}: ${h(item.title)}</b>${item.dueDate ? `<br>Due: ${h(item.dueDate)}` : ""}<br>Submissions: ${h(Object.keys(submissions).length)}`;
    if (typeof item.picture === "string" && item.picture.startsWith("data:image/")) { const picture = document.createElement("img"); picture.src = item.picture; picture.alt = item.title || "Homework picture"; picture.style.maxWidth = "300px"; picture.style.maxHeight = "200px"; picture.style.display = "block"; picture.style.margin = "10px 0"; box.append(picture); }
    Object.entries(submissions).forEach(([uid, submission]) => {
      const review = document.createElement("div"); const studentName = users[uid]?.profile?.name || users[uid]?.profile?.username || "Student";
      review.innerHTML = `<br><b>${h(studentName)}</b><br>Student answers: ${h(Object.values(submission.answers || {}).map(homeworkAnswerText).join(", "))}<br>Correct answers: ${h(Object.values(answerKey.answers || {}).map(homeworkAnswerText).join(", "))}<br>Overall grade (0-100): <input type="number" min="0" max="100" value="${h(submission.grade ?? "")}"> `;
      const saveGrade = document.createElement("button"); saveGrade.textContent = "Save grade"; saveGrade.onclick = async () => {
        const grade = Number(review.querySelector("input").value);
        if (!Number.isFinite(grade) || grade < 0 || grade > 100) return setMessage("Enter a grade from 0 to 100.");
        await update(ref(db, `homeworkSubmissions/${id}/${uid}`), { grade, correctAnswers: answerKey.answers || [], gradedAt: Date.now() });
        setMessage(`Saved ${studentName}'s homework grade.`);
      };
      review.append(saveGrade); box.append(review);
    });
    const removeButton = document.createElement("button"); removeButton.textContent = "Remove homework"; removeButton.onclick = async () => { await remove(ref(db, `homeworks/${id}`)); await remove(ref(db, `homeworkAnswerKeys/${id}`)); location.reload(); }; box.append(document.createTextNode(" "), removeButton); area.append(box);
  }
}

async function adminGradesPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  const users = (await get(ref(db, "users"))).val() || {}; const area = document.querySelector("#student-grades"); area.innerHTML = "";
  Object.entries(users).forEach(([uid, record]) => {
    const subjects = selectedSubjects(record.school); if (!subjects.length) return;
    const box = document.createElement("div"); box.innerHTML = `<hr><b>${h(record.profile?.name || record.profile?.username || "Student")}</b><br>`;
    subjects.forEach(subject => {
      const row = document.createElement("div"); row.innerHTML = `${h(subject)}: <input type="text" value="${h(record.school?.grades?.[subject] ?? "")}" placeholder="Grade"> `;
      const save = document.createElement("button"); save.textContent = "Save"; save.onclick = async () => { await set(ref(db, `users/${uid}/school/grades/${subject}`), row.querySelector("input").value.trim()); setMessage("Grade saved."); }; row.append(save); box.append(row);
    }); area.append(box);
  });
  if (!area.children.length) area.textContent = "No students have chosen subjects yet.";
}

async function adminExamsPage(user) {
  const data = await requireUser(user, true); if (!data) return;
  addSubjectOptions(document.querySelector("#exam-subject"));
  document.querySelector("#exam-form").addEventListener("submit", async event => {
    event.preventDefault(); await set(push(ref(db, "upcomingExams")), { subject: document.querySelector("#exam-subject").value, date: document.querySelector("#exam-date").value, details: document.querySelector("#exam-details").value.trim() }); setMessage("Upcoming exam added."); event.target.reset(); location.reload();
  });
  const exams = (await get(ref(db, "upcomingExams"))).val() || {}; const area = document.querySelector("#admin-exam-list"); area.innerHTML = "";
  if (!Object.keys(exams).length) area.textContent = "No upcoming exams yet.";
  Object.entries(exams).forEach(([id, exam]) => { const row = document.createElement("div"); row.innerHTML = `<hr><b>${h(exam.subject)}</b>: ${h(exam.date)} - ${h(exam.details)} `; const removeButton = document.createElement("button"); removeButton.textContent = "Remove"; removeButton.onclick = async () => { await remove(ref(db, `upcomingExams/${id}`)); location.reload(); }; row.append(removeButton); area.append(row); });
}

if (page === "auth") {
  authPage();
} else onAuthStateChanged(auth, async user => {
  if (!user) return redirect("index.html");
  try {
    await applyAccountTheme(user);
    if (page === "home") await homePage(user);
    if (page === "property") await propertyPage(user);
    if (page === "bank") await bankPage(user);
    if (page === "finances") await financesPage(user);
    if (page === "property-request") await propertyRequestPage(user);
    if (page === "taxes") await taxesPage(user);
    if (page === "user-tax-form") await userTaxFormPage(user);
    if (page === "tax-payment") await taxPaymentPage(user);
    if (page === "rent-payment") await rentPaymentPage(user);
    if (page === "school") await schoolPage(user);
    if (page === "school-register") await schoolRegisterPage(user);
    if (page === "stem-subjects") await subjectsPage(user, stemSubjects);
    if (page === "literature-subjects") await subjectsPage(user, literatureSubjects);
    if (page === "homeworks") await homeworksPage(user);
    if (page === "grades") await gradesPage(user);
    if (page === "upcoming-exams") await upcomingExamsPage(user);
    if (page === "calendar") await calendarPage(user);
    if (page === "announcements") await announcementsPage(user);
    if (page === "admin") { const data = await requireUser(user, true); if (data) logOutLink(); }
    if (page === "property-requests") await propertyRequestsPage(user);
    if (page === "tax-forms") await taxFormsPage(user);
    if (page === "tax-settings") await taxSettingsPage(user);
    if (page === "school-records") await schoolRecordsPage(user);
    if (page === "admin-homeworks") await adminHomeworksPage(user);
    if (page === "admin-grades") await adminGradesPage(user);
    if (page === "admin-exams") await adminExamsPage(user);
    if (page === "admin-announcements") await adminAnnouncementsPage(user);
  } catch (error) { console.error(error); setMessage("There was a Firebase error. Check setup and permissions."); }
});
