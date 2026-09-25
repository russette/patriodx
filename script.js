const PAYSTACK_PUBLIC_KEY =
    "pk_live_e1462983063e834b226acdca9492e980762a6ddd";
const SUPABASE_URL = "https://saerujjsfzyxkyacbvgr.supabase.co";
const SUPABASE_KEY = "sb_publishable_l50YIYtYLXkjWE1iQSTyoA_GkrIKWn7";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

let products = [];
let customers = [];
let sales = [];
let invoices = [];

let currentUser = null;
let currentBusiness = null;
let currentPlan = "free";
let editingProductId = null;


// =========================================================
// PLAN LIMITS
// =========================================================

const PLAN_LIMITS = {
    free: {
        products: 20,
        customers: 20,
        salesPerMonth: 30,
        invoicesPerMonth: 5
    },

    pro: {
        products: Infinity,
        customers: Infinity,
        salesPerMonth: Infinity,
        invoicesPerMonth: Infinity
    },

    business: {
        products: Infinity,
        customers: Infinity,
        salesPerMonth: Infinity,
        invoicesPerMonth: Infinity
    }
};


// =========================================================
// BASIC HELPERS
// =========================================================

function money(value) {
    return `$${Number(value || 0).toFixed(2)}`;
}

function safe(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function todayString() {
    return new Date().toISOString().split("T")[0];
}

function createReference() {
    return "INV-" + Date.now();
}

function formatDate(date) {
    if (!date) return "—";

    const d = new Date(date);

    if (Number.isNaN(d.getTime())) return "—";

    return d.toLocaleDateString();
}


// =========================================================
// PLAN CHECKING
// =========================================================

function loadPlan() {

    if (!currentBusiness) {
        currentPlan = "free";
        return;
    }

    currentPlan =
        String(currentBusiness.plan || "free").toLowerCase();

    if (!PLAN_LIMITS[currentPlan]) {
        currentPlan = "free";
    }

    console.log("PATRIODX plan:", currentPlan);
}

function getSalesThisMonth() {

    const now = new Date();

    return sales.filter(sale => {

        if (!sale.created_at) return false;

        const date = new Date(sale.created_at);

        return (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth()
        );

    }).length;
}

function getInvoicesThisMonth() {

    const now = new Date();

    return invoices.filter(invoice => {

        if (!invoice.created_at) return false;

        const date = new Date(invoice.created_at);

        return (
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth()
        );

    }).length;
}

function canCreate(type) {

    const limits =
        PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;

    if (type === "product") {

        if (products.length >= limits.products) {

            alert(
                "Free plan limit reached: 20 products.\n\nUpgrade to Pro for unlimited products."
            );

            return false;
        }
    }

    if (type === "customer") {

        if (customers.length >= limits.customers) {

            alert(
                "Free plan limit reached: 20 customers.\n\nUpgrade to Pro for unlimited customers."
            );

            return false;
        }
    }

    if (type === "sale") {

        const count =
            getSalesThisMonth();

        if (count >= limits.salesPerMonth) {

            alert(
                "Free plan limit reached: 30 sales this month.\n\nUpgrade to Pro for unlimited sales."
            );

            return false;
        }
    }

    if (type === "invoice") {

        const count =
            getInvoicesThisMonth();

        if (count >= limits.invoicesPerMonth) {

            alert(
                "Free plan limit reached: 5 invoices this month.\n\nUpgrade to Pro for unlimited invoices."
            );

            return false;
        }
    }

    return true;
}


// =========================================================
// AUTH / SUPABASE
// =========================================================

async function loadUser() {

    const {
        data: { session },
        error
    } = await supabaseClient.auth.getSession();

    if (error) {

        console.error(error);

        alert("Unable to connect to PATRIODX.");

        return false;
    }

    if (!session) {

        window.location.href = "auth.html";

        return false;
    }

    currentUser = session.user;

    const userEmail =
        document.getElementById("userEmail");

    if (userEmail) {
        userEmail.textContent =
            currentUser.email || "Account";
    }

    const { data: business, error: businessError } =
        await supabaseClient
            .from("businesses")
            .select("*")
            .eq("owner_id", currentUser.id)
            .single();

    if (businessError) {

        console.error(businessError);

        alert(
            "Your PATRIODX business account could not be loaded."
        );

        return false;
    }

    currentBusiness = business;

    loadPlan();

    return true;
}


// =========================================================
// LOAD DATA
// =========================================================

async function loadData() {

    if (!currentBusiness) return;

    const businessId =
        currentBusiness.id;

    const [
        productsResult,
        customersResult,
        salesResult,
        invoicesResult
    ] = await Promise.all([

        supabaseClient
            .from("products")
            .select("*")
            .eq("business_id", businessId)
            .order("created_at", {
                ascending: false
            }),

        supabaseClient
            .from("customers")
            .select("*")
            .eq("business_id", businessId)
            .order("created_at", {
                ascending: false
            }),

        supabaseClient
            .from("sales")
            .select("*")
            .eq("business_id", businessId)
            .order("created_at", {
                ascending: false
            }),

        supabaseClient
            .from("invoices")
            .select("*")
            .eq("business_id", businessId)
            .order("created_at", {
                ascending: false
            })
    ]);

    if (productsResult.error) {
        console.error(productsResult.error);
    }

    if (customersResult.error) {
        console.error(customersResult.error);
    }

    if (salesResult.error) {
        console.error(salesResult.error);
    }

    if (invoicesResult.error) {
        console.error(invoicesResult.error);
    }

    products =
        productsResult.data || [];

    customers =
        customersResult.data || [];

    sales =
        salesResult.data || [];

    invoices =
        invoicesResult.data || [];
}


/* =========================================================
   PATRIODX NAVIGATION COMPATIBILITY
   All navigation goes through the app router.
========================================================= */

function scrollToSection(id) {

    if (typeof navigatePATRIODX === "function") {

        let pageId = id;

        /*
           Support the old AI section name.
        */
        if (pageId === "ai") {
            pageId = "patriodxAI";
        }

        navigatePATRIODX(pageId);
        return;
    }

    /*
       Fallback only if router has not loaded yet.
    */
    const section = document.getElementById(id);

    if (section) {
        section.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}


function setupNavigation() {

    /*
       The main PATRIODX router handles navigation.
       This function intentionally does not add
       another click listener.
    */

    return;
}

// =========================================================
// DARK MODE
// =========================================================

function setupDarkMode() {

    const button =
        document.getElementById("themeToggle");

    if (!button) return;

    const savedTheme =
        localStorage.getItem("patriodxTheme");

    if (savedTheme === "dark") {

        document.body.classList.add(
            "dark-mode"
        );

        button.textContent =
            "☀️ Light Mode";
    }

    button.addEventListener(
        "click",
        function() {

            document.body.classList.toggle(
                "dark-mode"
            );

            const dark =
                document.body.classList.contains(
                    "dark-mode"
                );

            localStorage.setItem(
                "patriodxTheme",
                dark ? "dark" : "light"
            );

            button.textContent =
                dark
                    ? "☀️ Light Mode"
                    : "🌙 Dark Mode";
        }
    );
}


// =========================================================
// PRODUCT MODAL
// =========================================================

function openProductModal(productId = null) {

    const modal =
        document.getElementById("productModal");

    const form =
        document.getElementById("productForm");

    if (!modal || !form) return;

    editingProductId =
        productId;

    form.reset();

    document.getElementById(
        "productId"
    ).value = "";

    document.getElementById(
        "productModalTitle"
    ).textContent =
        productId
            ? "Edit Product"
            : "Add Product";

    if (productId) {

        const product =
            products.find(
                p => p.id === productId
            );

        if (!product) return;

        document.getElementById(
            "productId"
        ).value =
            product.id;

        document.getElementById(
            "productName"
        ).value =
            product.name;

        document.getElementById(
            "productPrice"
        ).value =
            product.price;

        document.getElementById(
            "productStock"
        ).value =
            product.stock;
    }

    modal.classList.add("active");
}

function closeProductModal() {

    const modal =
        document.getElementById(
            "productModal"
        );

    if (modal) {
        modal.classList.remove(
            "active"
        );
    }

    editingProductId = null;
}

async function saveProduct(event) {

    event.preventDefault();

    if (!currentBusiness) return;

    const name =
        document.getElementById(
            "productName"
        ).value.trim();

    const price =
        Number(
            document.getElementById(
                "productPrice"
            ).value
        );

    const stock =
        Number(
            document.getElementById(
                "productStock"
            ).value
        );

    if (
        !name ||
        price < 0 ||
        stock < 0
    ) {

        alert(
            "Please enter valid product details."
        );

        return;
    }

    let result;

    if (editingProductId) {

        result =
            await supabaseClient
                .from("products")
                .update({
                    name,
                    price,
                    stock,
                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    editingProductId
                )
                .eq(
                    "business_id",
                    currentBusiness.id
                );

    } else {

        if (!canCreate("product")) {
            return;
        }

        result =
            await supabaseClient
                .from("products")
                .insert({
                    business_id:
                        currentBusiness.id,
                    name,
                    price,
                    stock
                });
    }

    if (result.error) {

        console.error(result.error);

        alert(
            "Could not save product."
        );

        return;
    }

    closeProductModal();

    await loadData();

    renderAll();
}


// =========================================================
// PRODUCT DISPLAY
// =========================================================

function renderProducts() {

    const container =
        document.getElementById(
            "productsList"
        );

    if (!container) return;

    const search =
        document.getElementById(
            "productSearch"
        )?.value
            .toLowerCase()
            .trim() || "";

    const filtered =
        products.filter(product =>
            product.name
                .toLowerCase()
                .includes(search)
        );

    if (!filtered.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <h3>No products yet</h3>
                <p>Add your first product to start managing your inventory.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        filtered.map(product => `

        <div class="item-card">

            <h3>${safe(product.name)}</h3>

            <p>
                Price:
                <strong>
                    ${money(product.price)}
                </strong>
            </p>

            <p>
                Stock:
                <strong>
                    ${product.stock}
                </strong>
            </p>

            <div class="card-actions">

                <button
                    type="button"
                    onclick="openProductModal('${product.id}')"
                >
                    Edit
                </button>

                <button
                    type="button"
                    class="danger-btn"
                    onclick="deleteProduct('${product.id}')"
                >
                    Delete
                </button>

            </div>

        </div>

    `).join("");
}

async function deleteProduct(id) {

    if (!confirm("Delete this product?")) {
        return;
    }

    const { error } =
        await supabaseClient
            .from("products")
            .delete()
            .eq(
                "id",
                id
            )
            .eq(
                "business_id",
                currentBusiness.id
            );

    if (error) {

        console.error(error);

        alert(
            "Could not delete product."
        );

        return;
    }

    await loadData();

    renderAll();
}


// =========================================================
// CUSTOMER MODAL
// =========================================================

function openCustomerModal() {

    const modal =
        document.getElementById(
            "customerModal"
        );

    const form =
        document.getElementById(
            "customerForm"
        );

    if (!modal || !form) return;

    form.reset();

    modal.classList.add("active");
}

function closeCustomerModal() {

    const modal =
        document.getElementById(
            "customerModal"
        );

    if (modal) {
        modal.classList.remove(
            "active"
        );
    }
}

async function saveCustomer(event) {

    event.preventDefault();

    if (!currentBusiness) return;

    if (!canCreate("customer")) {
        return;
    }

    const name =
        document.getElementById(
            "customerName"
        ).value.trim();

    const email =
        document.getElementById(
            "customerEmail"
        ).value.trim();

    const phone =
        document.getElementById(
            "customerPhone"
        ).value.trim();

    if (!name) {

        alert(
            "Customer name is required."
        );

        return;
    }

    const { error } =
        await supabaseClient
            .from("customers")
            .insert({
                business_id:
                    currentBusiness.id,
                name,
                email,
                phone
            });

    if (error) {

        console.error(error);

        alert(
            "Could not save customer."
        );

        return;
    }

    closeCustomerModal();

    await loadData();

    renderAll();
}


// =========================================================
// CUSTOMERS DISPLAY
// =========================================================

function renderCustomers() {

    const container =
        document.getElementById(
            "customersList"
        );

    if (!container) return;

    const search =
        document.getElementById(
            "customerSearch"
        )?.value
            .toLowerCase()
            .trim() || "";

    const filtered =
        customers.filter(customer =>

            customer.name
                .toLowerCase()
                .includes(search)

            ||

            (customer.email || "")
                .toLowerCase()
                .includes(search)

            ||

            (customer.phone || "")
                .toLowerCase()
                .includes(search)
        );

    if (!filtered.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <h3>No customers yet</h3>
                <p>Add your first customer to start building your customer list.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        filtered.map(customer => `

        <div class="item-card">

            <h3>
                ${safe(customer.name)}
            </h3>

            <p>
                📧
                ${safe(
                    customer.email ||
                    "No email"
                )}
            </p>

            <p>
                📱
                ${safe(
                    customer.phone ||
                    "No phone"
                )}
            </p>

            <div class="card-actions">

                <button
                    type="button"
                    class="danger-btn"
                    onclick="deleteCustomer('${customer.id}')"
                >
                    Delete
                </button>

            </div>

        </div>

    `).join("");
}

async function deleteCustomer(id) {

    if (!confirm("Delete this customer?")) {
        return;
    }

    const { error } =
        await supabaseClient
            .from("customers")
            .delete()
            .eq(
                "id",
                id
            )
            .eq(
                "business_id",
                currentBusiness.id
            );

    if (error) {

        console.error(error);

        alert(
            "Could not delete customer."
        );

        return;
    }

    await loadData();

    renderAll();
}


// =========================================================
// SALE MODAL
// =========================================================

function openSaleModal() {

    const modal =
        document.getElementById(
            "saleModal"
        );

    const select =
        document.getElementById(
            "saleProduct"
        );

    if (!modal || !select) return;

    select.innerHTML = `
        <option value="">
            Select a product
        </option>
    `;

    products.forEach(product => {

        select.innerHTML += `
            <option value="${product.id}">
                ${safe(product.name)}
                —
                ${money(product.price)}
                —
                Stock: ${product.stock}
            </option>
        `;
    });

    document.getElementById(
        "saleQuantity"
    ).value = 1;

    updateSaleTotal();

    modal.classList.add("active");
}

function closeSaleModal() {

    const modal =
        document.getElementById(
            "saleModal"
        );

    if (modal) {
        modal.classList.remove(
            "active"
        );
    }
}

function updateSaleTotal() {

    const productId =
        document.getElementById(
            "saleProduct"
        )?.value;

    const quantity =
        Number(
            document.getElementById(
                "saleQuantity"
            )?.value || 0
        );

    const product =
        products.find(
            p => p.id === productId
        );

    const total =
        product
            ? Number(product.price) *
              quantity
            : 0;

    const display =
        document.getElementById(
            "saleTotal"
        );

    if (display) {
        display.textContent =
            money(total);
    }
}

async function saveSale(event) {

    event.preventDefault();

    if (!currentBusiness) return;

    if (!canCreate("sale")) {
        return;
    }

    const productId =
        document.getElementById(
            "saleProduct"
        ).value;

    const quantity =
        Number(
            document.getElementById(
                "saleQuantity"
            ).value
        );

    const product =
        products.find(
            p => p.id === productId
        );

    if (!product) {

        alert(
            "Please select a product."
        );

        return;
    }

    if (quantity <= 0) {

        alert(
            "Quantity must be at least 1."
        );

        return;
    }

    if (quantity > product.stock) {

        alert(
            "Not enough stock."
        );

        return;
    }

    const total =
        Number(product.price) *
        quantity;

    const {
        data: sale,
        error: saleError
    } =
        await supabaseClient
            .from("sales")
            .insert({
                business_id:
                    currentBusiness.id,
                product_id:
                    product.id,
                product_name:
                    product.name,
                quantity,
                total
            })
            .select()
            .single();

    if (saleError) {

        console.error(saleError);

        alert(
            "Could not record sale."
        );

        return;
    }

    const { error: stockError } =
        await supabaseClient
            .from("products")
            .update({
                stock:
                    product.stock -
                    quantity,

                updated_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                product.id
            )
            .eq(
                "business_id",
                currentBusiness.id
            );

    if (stockError) {

        console.error(stockError);

        await supabaseClient
            .from("sales")
            .delete()
            .eq(
                "id",
                sale.id
            );

        alert(
            "Sale could not update stock."
        );

        return;
    }

    closeSaleModal();

    await loadData();

    renderAll();
}


// =========================================================
// SALES DISPLAY
// =========================================================

function renderSales() {

    const container =
        document.getElementById(
            "salesList"
        );

    if (!container) return;

    const search =
        document.getElementById(
            "salesSearch"
        )?.value
            .toLowerCase()
            .trim() || "";

    const filtered =
        sales.filter(sale =>

            (sale.product_name || "")
                .toLowerCase()
                .includes(search)
        );

    if (!filtered.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🧾</div>
                <h3>No sales yet</h3>
                <p>Your recorded sales will appear here.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        filtered.map(sale => `

        <div class="sale-card">

            <div>

                <h3>
                    ${safe(
                        sale.product_name
                    )}
                </h3>

                <p>
                    Quantity:
                    ${sale.quantity}
                </p>

                <small>
                    ${formatDate(
                        sale.created_at
                    )}
                </small>

            </div>

            <strong>
                ${money(sale.total)}
            </strong>

            <button
                type="button"
                class="danger-btn"
                onclick="deleteSale('${sale.id}')"
            >
                Delete
            </button>

        </div>

    `).join("");
}

async function deleteSale(id) {

    const sale =
        sales.find(
            s => s.id === id
        );

    if (!sale) return;

    if (!confirm("Delete this sale?")) {
        return;
    }

    const { error } =
        await supabaseClient
            .from("sales")
            .delete()
            .eq(
                "id",
                id
            )
            .eq(
                "business_id",
                currentBusiness.id
            );

    if (error) {

        console.error(error);

        alert(
            "Could not delete sale."
        );

        return;
    }

    if (sale.product_id) {

        const product =
            products.find(
                p => p.id === sale.product_id
            );

        if (product) {

            await supabaseClient
                .from("products")
                .update({
                    stock:
                        Number(product.stock) +
                        Number(sale.quantity),

                    updated_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    product.id
                )
                .eq(
                    "business_id",
                    currentBusiness.id
                );
        }
    }

    await loadData();

    renderAll();
}


// =========================================================
// INVOICE MODAL
// =========================================================

function openInvoiceModal() {

    const modal =
        document.getElementById(
            "invoiceModal"
        );

    if (!modal) return;

    const customerSelect =
        document.getElementById(
            "invoiceCustomer"
        );

    const productSelect =
        document.getElementById(
            "invoiceProduct"
        );

    customerSelect.innerHTML = `
        <option value="">
            Select a customer
        </option>
    `;

    customers.forEach(customer => {

        customerSelect.innerHTML += `
            <option value="${customer.id}">
                ${safe(customer.name)}
            </option>
        `;
    });

    productSelect.innerHTML = `
        <option value="">
            Select a product
        </option>
    `;

    products.forEach(product => {

        productSelect.innerHTML += `
            <option value="${product.id}">
                ${safe(product.name)}
                —
                ${money(product.price)}
            </option>
        `;
    });

    document.getElementById(
        "invoiceNumber"
    ).value =
        createReference();

    document.getElementById(
        "invoiceDueDate"
    ).value =
        todayString();

    document.getElementById(
        "invoiceQuantity"
    ).value = 1;

    document.getElementById(
        "invoiceDiscount"
    ).value = 0;

    document.getElementById(
        "invoiceTax"
    ).value = 0;

    updateInvoiceTotal();

    modal.classList.add("active");
}

function closeInvoiceModal() {

    const modal =
        document.getElementById(
            "invoiceModal"
        );

    if (modal) {
        modal.classList.remove(
            "active"
        );
    }
}

function updateInvoiceTotal() {

    const productId =
        document.getElementById(
            "invoiceProduct"
        )?.value;

    const quantity =
        Number(
            document.getElementById(
                "invoiceQuantity"
            )?.value || 0
        );

    const discount =
        Number(
            document.getElementById(
                "invoiceDiscount"
            )?.value || 0
        );

    const taxRate =
        Number(
            document.getElementById(
                "invoiceTax"
            )?.value || 0
        );

    const product =
        products.find(
            p => p.id === productId
        );

    const subtotal =
        product
            ? Number(product.price) *
              quantity
            : 0;

    const afterDiscount =
        Math.max(
            0,
            subtotal - discount
        );

    const tax =
        afterDiscount *
        (taxRate / 100);

    const total =
        afterDiscount + tax;

    document.getElementById(
        "invoiceSubtotal"
    ).textContent =
        money(subtotal);

    document.getElementById(
        "invoiceDiscountDisplay"
    ).textContent =
        "-" + money(discount);

    document.getElementById(
        "invoiceTaxDisplay"
    ).textContent =
        money(tax);

    document.getElementById(
        "invoiceTotal"
    ).textContent =
        money(total);
}

async function saveInvoice(event) {

    event.preventDefault();

    if (!currentBusiness) return;

    if (!canCreate("invoice")) {
        return;
    }

    const invoiceNumber =
        document.getElementById(
            "invoiceNumber"
        ).value;

    const customerId =
        document.getElementById(
            "invoiceCustomer"
        ).value;

    const productId =
        document.getElementById(
            "invoiceProduct"
        ).value;

    const quantity =
        Number(
            document.getElementById(
                "invoiceQuantity"
            ).value
        );

    const dueDate =
        document.getElementById(
            "invoiceDueDate"
        ).value;

    const discount =
        Number(
            document.getElementById(
                "invoiceDiscount"
            ).value || 0
        );

    const taxRate =
        Number(
            document.getElementById(
                "invoiceTax"
            ).value || 0
        );

    const customer =
        customers.find(
            c => c.id === customerId
        );

    const product =
        products.find(
            p => p.id === productId
        );

    if (!customer || !product) {

        alert(
            "Please select a customer and product."
        );

        return;
    }

    const subtotal =
        Number(product.price) *
        quantity;

    const afterDiscount =
        Math.max(
            0,
            subtotal - discount
        );

    const tax =
        afterDiscount *
        (taxRate / 100);

    const total =
        afterDiscount + tax;

    const { error } =
        await supabaseClient
            .from("invoices")
            .insert({

                business_id:
                    currentBusiness.id,

                invoice_number:
                    invoiceNumber,

                customer_id:
                    customer.id,

                customer_name:
                    customer.name,

                product_id:
                    product.id,

                product_name:
                    product.name,

                quantity,

                subtotal,

                discount,

                tax_rate:
                    taxRate,

                tax,

                total,

                due_date:
                    dueDate,

                status:
                    "unpaid"
            });

    if (error) {

        console.error(error);

        alert(
            "Could not create invoice."
        );

        return;
    }

    closeInvoiceModal();

    await loadData();

    renderAll();
}


// =========================================================
// INVOICE DISPLAY
// =========================================================

function renderInvoices() {

    const container =
        document.getElementById(
            "invoicesList"
        );

    if (!container) return;

    const search =
        document.getElementById(
            "invoiceSearch"
        )?.value
            .toLowerCase()
            .trim() || "";

    const status =
        document.getElementById(
            "invoiceStatusFilter"
        )?.value || "all";

    const filtered =
        invoices.filter(invoice => {

            const matchesSearch =

                (invoice.invoice_number || "")
                    .toLowerCase()
                    .includes(search)

                ||

                (invoice.customer_name || "")
                    .toLowerCase()
                    .includes(search)

                ||

                (invoice.product_name || "")
                    .toLowerCase()
                    .includes(search);

            const matchesStatus =
                status === "all" ||
                invoice.status === status;

            return (
                matchesSearch &&
                matchesStatus
            );
        });

    if (!filtered.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🧾</div>
                <h3>No invoices yet</h3>
                <p>Create your first invoice for a customer.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        filtered.map(invoice => `

        <div class="invoice-card">

            <div>

                <h3>
                    ${safe(
                        invoice.invoice_number
                    )}
                </h3>

                <p>
                    Customer:
                    ${safe(
                        invoice.customer_name
                    )}
                </p>

                <p>
                    Product:
                    ${safe(
                        invoice.product_name
                    )}
                </p>

                <p>
                    Due:
                    ${formatDate(
                        invoice.due_date
                    )}
                </p>

                <strong>
                    ${money(invoice.total)}
                </strong>

            </div>

            <div>

                <span>
                    ${
                        invoice.status === "paid"
                            ? "✅ Paid"
                            : "⏳ Unpaid"
                    }
                </span>

                <br><br>

                <button
                    type="button"
                    onclick="toggleInvoiceStatus('${invoice.id}')"
                >
                    Mark ${
                        invoice.status === "paid"
                            ? "Unpaid"
                            : "Paid"
                    }
                </button>

                <button
                    type="button"
                    onclick="viewInvoice('${invoice.id}')"
                >
                    View
                </button>

                <button
                    type="button"
                    class="danger-btn"
                    onclick="deleteInvoice('${invoice.id}')"
                >
                    Delete
                </button>

            </div>

        </div>

    `).join("");
}

async function toggleInvoiceStatus(id) {

    const invoice =
        invoices.find(
            i => i.id === id
        );

    if (!invoice) return;

    const newStatus =
        invoice.status === "paid"
            ? "unpaid"
            : "paid";

    const { error } =
        await supabaseClient
            .from("invoices")
            .update({
                status: newStatus
            })
            .eq(
                "id",
                id
            )
            .eq(
                "business_id",
                currentBusiness.id
            );

    if (error) {

        console.error(error);

        alert(
            "Could not update invoice."
        );

        return;
    }

    await loadData();

    renderAll();
}

async function deleteInvoice(id) {

    if (!confirm("Delete this invoice?")) {
        return;
    }

    const { error } =
        await supabaseClient
            .from("invoices")
            .delete()
            .eq(
                "id",
                id
            )
            .eq(
                "business_id",
                currentBusiness.id
            );

    if (error) {

        console.error(error);

        alert(
            "Could not delete invoice."
        );

        return;
    }

    await loadData();

    renderAll();
}

function viewInvoice(id) {

    const invoice =
        invoices.find(
            i => i.id === id
        );

    if (!invoice) return;

    const modal =
        document.getElementById(
            "invoiceViewModal"
        );

    const content =
        document.getElementById(
            "invoiceViewContent"
        );

    content.innerHTML = `

        <div class="invoice-view">

            <p class="eyebrow">
                PATRIODX INVOICE
            </p>

            <h2>
                ${safe(
                    invoice.invoice_number
                )}
            </h2>

            <hr>

            <p>
                <strong>Customer:</strong>
                ${safe(
                    invoice.customer_name
                )}
            </p>

            <p>
                <strong>Product:</strong>
                ${safe(
                    invoice.product_name
                )}
            </p>

            <p>
                <strong>Quantity:</strong>
                ${invoice.quantity}
            </p>

            <p>
                <strong>Due Date:</strong>
                ${formatDate(
                    invoice.due_date
                )}
            </p>

            <hr>

            <p>
                Subtotal:
                ${money(invoice.subtotal)}
            </p>

            <p>
                Discount:
                -${money(invoice.discount)}
            </p>

            <p>
                Tax:
                ${money(invoice.tax)}
            </p>

            <h2>
                Total:
                ${money(invoice.total)}
            </h2>

            <p>
                Status:
                ${
                    invoice.status === "paid"
                        ? "✅ Paid"
                        : "⏳ Unpaid"
                }
            </p>

        </div>
    `;

    modal.classList.add("active");
}

function closeInvoiceViewModal() {

    const modal =
        document.getElementById(
            "invoiceViewModal"
        );

    if (modal) {
        modal.classList.remove(
            "active"
        );
    }
}


// =========================================================
// STATS
// =========================================================

function renderStats() {

    const totalRevenue =
        sales.reduce(
            (sum, sale) =>
                sum +
                Number(sale.total || 0),
            0
        );

    const today =
        todayString();

    const todayRevenue =
        sales
            .filter(sale =>
                sale.created_at &&
                sale.created_at.startsWith(
                    today
                )
            )
            .reduce(
                (sum, sale) =>
                    sum +
                    Number(
                        sale.total || 0
                    ),
                0
            );

    document.getElementById(
        "totalRevenue"
    ).textContent =
        money(totalRevenue);

    document.getElementById(
        "todayRevenue"
    ).textContent =
        money(todayRevenue);

    document.getElementById(
        "totalProducts"
    ).textContent =
        products.length;

    document.getElementById(
        "totalCustomers"
    ).textContent =
        customers.length;

    document.getElementById(
        "totalSales"
    ).textContent =
        sales.length;

    document.getElementById(
        "paidInvoices"
    ).textContent =
        invoices.filter(
            i => i.status === "paid"
        ).length;

    document.getElementById(
        "unpaidInvoices"
    ).textContent =
        invoices.filter(
            i => i.status !== "paid"
        ).length;

    document.getElementById(
        "lowStockProducts"
    ).textContent =
        products.filter(
            p => Number(p.stock) <= 5
        ).length;
}


// =========================================================
// ANALYTICS
// =========================================================

function renderAnalytics() {

    const totalRevenue =
        sales.reduce(
            (sum, sale) =>
                sum +
                Number(sale.total || 0),
            0
        );

    const totalUnits =
        sales.reduce(
            (sum, sale) =>
                sum +
                Number(
                    sale.quantity || 0
                ),
            0
        );

    const average =
        sales.length
            ? totalRevenue /
              sales.length
            : 0;

    const inventoryValue =
        products.reduce(
            (sum, product) =>
                sum +
                Number(
                    product.price || 0
                ) *
                Number(
                    product.stock || 0
                ),
            0
        );

    const largest =
        sales.length
            ? Math.max(
                ...sales.map(
                    s =>
                        Number(
                            s.total || 0
                        )
                )
            )
            : 0;

    document.getElementById(
        "averageSale"
    ).textContent =
        money(average);

    document.getElementById(
        "unitsInStock"
    ).textContent =
        products.reduce(
            (sum, product) =>
                sum +
                Number(
                    product.stock || 0
                ),
            0
        );

    document.getElementById(
        "inventoryValue"
    ).textContent =
        money(inventoryValue);

    document.getElementById(
        "overviewRevenue"
    ).textContent =
        money(totalRevenue);

    document.getElementById(
        "unitsSold"
    ).textContent =
        totalUnits;

    document.getElementById(
        "overviewAverage"
    ).textContent =
        money(average);

    document.getElementById(
        "largestSale"
    ).textContent =
        money(largest);


    // BEST SELLER

    const productSales = {};

    sales.forEach(sale => {

        const name =
            sale.product_name ||
            "Unknown";

        productSales[name] =
            (
                productSales[name] ||
                0
            ) +
            Number(
                sale.quantity || 0
            );
    });

    let bestSeller = "—";

    Object.keys(
        productSales
    ).forEach(name => {

        if (
            bestSeller === "—" ||
            productSales[name] >
            productSales[bestSeller]
        ) {

            bestSeller =
                name;
        }
    });

    document.getElementById(
        "bestSeller"
    ).textContent =
        bestSeller;


    // TOP PRODUCTS

    const topProducts =
        Object.entries(
            productSales
        )
            .sort(
                (a, b) =>
                    b[1] - a[1]
            )
            .slice(0, 5);

    const topContainer =
        document.getElementById(
            "topProducts"
        );

    if (topContainer) {

        if (!topProducts.length) {

            topContainer.innerHTML =
                `<div class="empty-state">No sales yet.</div>`;

        } else {

            topContainer.innerHTML =
                topProducts
                    .map(
                        ([name, quantity]) => `
                            <div class="overview-row">
                                <span>
                                    ${safe(name)}
                                </span>

                                <strong>
                                    ${quantity} sold
                                </strong>
                            </div>
                        `
                    )
                    .join("");
        }
    }


    // INVENTORY ALERTS

    const alertContainer =
        document.getElementById(
            "inventoryAlerts"
        );

    if (alertContainer) {

        const lowStock =
            products.filter(
                p => Number(p.stock) <= 5
            );

        if (!lowStock.length) {

            alertContainer.innerHTML = `
                <div class="success-message">
                    ✅ All products have healthy stock levels.
                </div>
            `;

        } else {

            alertContainer.innerHTML =
                lowStock
                    .map(
                        product => `
                            <div class="overview-row">
                                <span>
                                    ${safe(product.name)}
                                </span>

                                <strong>
                                    ${product.stock} left
                                </strong>
                            </div>
                        `
                    )
                    .join("");
        }
    }


    // SIMPLE REVENUE TREND

    const chart =
        document.getElementById(
            "revenueChart"
        );

    if (!chart) return;

    if (!sales.length) {

        chart.innerHTML = `
            <div class="empty-chart">
                Make your first sale to see your revenue trend.
            </div>
        `;

        return;
    }

    const recent =
        [...sales]
            .reverse()
            .slice(-10);

    const max =
        Math.max(
            ...recent.map(
                s =>
                    Number(
                        s.total || 0
                    )
            ),
            1
        );

    chart.innerHTML = `

        <div class="simple-chart">

            ${
                recent
                    .map(sale => {

                        const height =
                            Math.max(
                                8,
                                (
                                    Number(
                                        sale.total ||
                                        0
                                    ) /
                                    max
                                ) *
                                100
                            );

                        return `
                            <div class="chart-bar-wrap">

                                <div
                                    class="chart-bar"
                                    style="height:${height}%"
                                    title="${money(
                                        sale.total
                                    )}"
                                ></div>

                            </div>
                        `;

                    })
                    .join("")
            }

        </div>
    `;
}


// =========================================================
// RECENT ACTIVITY
// =========================================================

function renderRecentActivity() {

    const container =
        document.getElementById(
            "recentActivity"
        );

    if (!container) return;

    if (
        !sales.length &&
        !invoices.length
    ) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📊</div>
                <h3>No recent activity</h3>
                <p>Your latest business activity will appear here.</p>
            </div>
        `;

        return;
    }

    const activity = [

        ...sales.map(sale => ({

            type: "Sale",

            text:
                `${sale.product_name} sale`,

            amount:
                sale.total,

            date:
                sale.created_at
        })),

        ...invoices.map(invoice => ({

            type: "Invoice",

            text:
                `${invoice.invoice_number} created`,

            amount:
                invoice.total,

            date:
                invoice.created_at
        }))

    ]
        .sort(
            (a, b) =>
                new Date(b.date) -
                new Date(a.date)
        )
        .slice(0, 8);

    container.innerHTML =
        activity
            .map(item => `

                <div class="activity-item">

                    <div>

                        <strong>
                            ${safe(item.type)}
                        </strong>

                        <p>
                            ${safe(item.text)}
                        </p>

                        <small>
                            ${formatDate(
                                item.date
                            )}
                        </small>

                    </div>

                    <strong>
                        ${money(item.amount)}
                    </strong>

                </div>

            `)
            .join("");
}
// =========================================================
// CHANGE PASSWORD
// =========================================================

async function changePassword() {

    if (!currentUser) {
        alert("Please log in again before changing your password.");
        return;
    }

    const newPassword = prompt(
        "Enter your new password (at least 6 characters):"
    );

    if (newPassword === null) {
        return;
    }

    if (newPassword.length < 6) {
        alert("Your new password must be at least 6 characters long.");
        return;
    }

    const confirmPassword = prompt(
        "Confirm your new password:"
    );

    if (confirmPassword === null) {
        return;
    }

    if (newPassword !== confirmPassword) {
        alert("The passwords do not match.");
        return;
    }

    const { error } =
        await supabaseClient.auth.updateUser({
            password: newPassword
        });

    if (error) {
        console.error(error);
        alert("Could not change your password. Please try again.");
        return;
    }

    alert("Your password has been changed successfully.");
}


// =========================================================
// DELETE ACCOUNT
// =========================================================

async function deleteAccount() {

    alert(
        "Account deletion requires a secure server-side process. Your account has not been deleted."
    );
}

// =========================================================
// SEARCH
// =========================================================

function setupSearch() {

    document
        .getElementById(
            "productSearch"
        )
        ?.addEventListener(
            "input",
            renderProducts
        );

    document
        .getElementById(
            "customerSearch"
        )
        ?.addEventListener(
            "input",
            renderCustomers
        );

    document
        .getElementById(
            "salesSearch"
        )
        ?.addEventListener(
            "input",
            renderSales
        );

    document
        .getElementById(
            "invoiceSearch"
        )
        ?.addEventListener(
            "input",
            renderInvoices
        );

    document
        .getElementById(
            "invoiceStatusFilter"
        )
        ?.addEventListener(
            "change",
            renderInvoices
        );
}


// =========================================================
// MODAL CLOSE
// =========================================================

function setupModalBehavior() {

    document
        .querySelectorAll(".modal")
        .forEach(modal => {

            modal.addEventListener(
                "click",
                function(event) {

                    if (
                        event.target === modal
                    ) {

                        modal.classList.remove(
                            "active"
                        );
                    }
                }
            );
        });
}


// =========================================================
// CONTACT
// =========================================================

function sendContactMessage(event) {

    event.preventDefault();

    const name =
        document.getElementById(
            "contactName"
        ).value.trim();

    const email =
        document.getElementById(
            "contactEmail"
        ).value.trim();

    const subject =
        document.getElementById(
            "contactSubject"
        ).value.trim();

    const message =
        document.getElementById(
            "contactMessage"
        ).value.trim();

    const body =
        `Name: ${name}\nEmail: ${email}\n\n${message}`;

    window.location.href =
        `mailto:patriodx@gmail.com?subject=${encodeURIComponent(
            subject
        )}&body=${encodeURIComponent(
            body
        )}`;
}


// =========================================================
// BACKUP
// =========================================================

async function exportBusinessData() {

    const data = {

        business:
            currentBusiness,

        products,

        customers,

        sales,

        invoices,

        exportedAt:
            new Date().toISOString()
    };

    const blob =
        new Blob(
            [
                JSON.stringify(
                    data,
                    null,
                    2
                )
            ],
            {
                type:
                    "application/json"
            }
        );

    const url =
        URL.createObjectURL(blob);

    const a =
        document.createElement(
            "a"
        );

    a.href = url;

    a.download =
        "patriodx-backup.json";

    a.click();

    URL.revokeObjectURL(url);
}

async function importBusinessData(file) {

    if (!file) return;

    alert(
        "Import is temporarily disabled while PATRIODX cloud storage is being finalized."
    );
}


// =========================================================
// RESET
// =========================================================

async function resetBusinessData() {

    if (!currentBusiness) return;

    const confirmed =
        confirm(
            "This will permanently delete your products, customers, sales and invoices. Continue?"
        );

    if (!confirmed) return;

    const businessId =
        currentBusiness.id;

    await supabaseClient
        .from("invoices")
        .delete()
        .eq(
            "business_id",
            businessId
        );

    await supabaseClient
        .from("sales")
        .delete()
        .eq(
            "business_id",
            businessId
        );

    await supabaseClient
        .from("customers")
        .delete()
        .eq(
            "business_id",
            businessId
        );

    await supabaseClient
        .from("products")
        .delete()
        .eq(
            "business_id",
            businessId
        );

    await loadData();

    renderAll();
}

// =========================================================
// PAYMENTS
// =========================================================

async function verifyPatriodxPayment(reference, expectedPlan) {

    try {

        const {
            data: sessionData,
            error: sessionError
        } = await supabaseClient.auth.getSession();

        if (sessionError || !sessionData?.session?.access_token) {

            console.error(
                "Supabase session error:",
                sessionError
            );

            alert(
                "Your login session has expired.\n\n" +
                "Please log in again and try the payment."
            );

            return false;
        }


       const response = await fetch(
    "https://businessos-wine-eight.vercel.app/api/verify-payment",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        "Bearer " +
                        sessionData.session.access_token
                },

                body: JSON.stringify({
                    reference: reference,
                    plan: expectedPlan
                })
            }
        );


        const result = await response.json();


        console.log(
            "PATRIODX payment verification:",
            result
        );


        if (!response.ok || !result.status) {

            console.error(
                "Payment verification failed:",
                result
            );

            alert(
                "Payment was received, but PATRIODX could not verify it.\n\n" +
                "Reference: " +
                reference +
                "\n\n" +
                "Please contact support and provide this reference."
            );

            return false;
        }


        alert(
            "Payment verified successfully! 🎉\n\n" +
            "Your PATRIODX " +
            result.data.plan +
            " plan is now active."
        );


        // Reload the business from Supabase
        // so the dashboard sees the new plan.

        if (typeof loadBusiness === "function") {

            await loadBusiness();

        } else {

            window.location.reload();

        }


        return true;

    } catch (error) {

        console.error(
            "Payment verification error:",
            error
        );

        alert(
            "Payment was completed, but verification could not be completed.\n\n" +
            "Please contact support if your plan does not update."
        );

        return false;
    }
}


function startProPlan() {

    if (!currentUser) {

        alert(
            "Please log in before upgrading your plan."
        );

        return;
    }


    const confirmed = confirm(
        "Upgrade to PATRIODX Pro for GHS 900/month?\n\n" +
        "Pro includes unlimited products, customers, sales and invoices."
    );


    if (!confirmed) {
        return;
    }


    if (typeof PaystackPop === "undefined") {

        alert(
            "Payment system could not load.\n\n" +
            "Please refresh the page and try again."
        );

        return;
    }


    try {

        const paystack = new PaystackPop();


        paystack.newTransaction({

            key: PAYSTACK_PUBLIC_KEY,

            email: currentUser.email,

            // GHS 900
            // Paystack uses pesewas.

            amount: 90000,

            currency: "GHS",

            metadata: {
                plan: "Pro"
            },


            onSuccess: async function(transaction) {

                console.log(
                    "Paystack transaction:",
                    transaction
                );


                alert(
                    "Payment received.\n\n" +
                    "Verifying your payment..."
                );


                await verifyPatriodxPayment(
                    transaction.reference,
                    "Pro"
                );

            },


            onCancel: function() {

                console.log(
                    "Paystack checkout cancelled."
                );

            },


            onError: function(error) {

                console.error(
                    "Paystack error:",
                    error
                );


                alert(
                    "Payment could not be completed.\n\n" +
                    "Please try again."
                );

            }

        });


    } catch (error) {

        console.error(
            "Paystack error:",
            error
        );


        alert(
            "Unable to start payment.\n\n" +
            "Please try again."
        );

    }
}


function startBusinessPlan() {

    if (!currentUser) {

        alert(
            "Please log in before upgrading your plan."
        );

        return;
    }


    const confirmed = confirm(
        "Upgrade to PATRIODX Business for GHS 1,900/month?\n\n" +
        "Business includes unlimited products, customers, sales and invoices."
    );


    if (!confirmed) {
        return;
    }


    if (typeof PaystackPop === "undefined") {

        alert(
            "Payment system could not load.\n\n" +
            "Please refresh the page and try again."
        );

        return;
    }


    try {

        const paystack = new PaystackPop();


        paystack.newTransaction({

            key: PAYSTACK_PUBLIC_KEY,

            email: currentUser.email,

            // GHS 1,900
            // Paystack uses pesewas.

            amount: 190000,

            currency: "GHS",

            metadata: {
                plan: "Business"
            },


            onSuccess: async function(transaction) {

                console.log(
                    "Paystack transaction:",
                    transaction
                );


                alert(
                    "Payment received.\n\n" +
                    "Verifying your payment..."
                );


                await verifyPatriodxPayment(
                    transaction.reference,
                    "Business"
                );

            },


            onCancel: function() {

                console.log(
                    "Paystack checkout cancelled."
                );

            },


            onError: function(error) {

                console.error(
                    "Paystack error:",
                    error
                );


                alert(
                    "Payment could not be completed.\n\n" +
                    "Please try again."
                );

            }

        });


    } catch (error) {

        console.error(
            "Paystack error:",
            error
        );


        alert(
            "Unable to start payment.\n\n" +
            "Please try again."
        );

    }
}
// =========================================================
// RENDER EVERYTHING
// =========================================================

function renderAll() {

    renderStats();

    renderProducts();

    renderCustomers();

    renderSales();

    renderInvoices();

    renderAnalytics();

    renderRecentActivity();
}


// =========================================================
// FORM EVENTS
// =========================================================

function setupForms() {

    document
        .getElementById(
            "productForm"
        )
        ?.addEventListener(
            "submit",
            saveProduct
        );

    document
        .getElementById(
            "customerForm"
        )
        ?.addEventListener(
            "submit",
            saveCustomer
        );

    document
        .getElementById(
            "saleForm"
        )
        ?.addEventListener(
            "submit",
            saveSale
        );

    document
        .getElementById(
            "invoiceForm"
        )
        ?.addEventListener(
            "submit",
            saveInvoice
        );

    document
        .getElementById(
            "saleProduct"
        )
        ?.addEventListener(
            "change",
            updateSaleTotal
        );

    document
        .getElementById(
            "saleQuantity"
        )
        ?.addEventListener(
            "input",
            updateSaleTotal
        );

    document
        .getElementById(
            "invoiceProduct"
        )
        ?.addEventListener(
            "change",
            updateInvoiceTotal
        );

    document
        .getElementById(
            "invoiceQuantity"
        )
        ?.addEventListener(
            "input",
            updateInvoiceTotal
        );

    document
        .getElementById(
            "invoiceDiscount"
        )
        ?.addEventListener(
            "input",
            updateInvoiceTotal
        );

    document
        .getElementById(
            "invoiceTax"
        )
        ?.addEventListener(
            "input",
            updateInvoiceTotal
        );
}


// =========================================================
// START PATRIODX
// =========================================================

async function startPATRIODX() {

    const authenticated =
        await loadUser();

    if (!authenticated) return;

    await loadData();

    loadPlan();

    

    setupSearch();

    setupDarkMode();

    setupModalBehavior();

    setupForms();

    document
        .getElementById(
            "logoutButton"
        )
        ?.addEventListener(
            "click",
            logoutUser
        );

    renderAll();

    console.log(
        "PATRIODX connected successfully."
    );
}


// =========================================================
// LOGOUT
// =========================================================

async function logoutUser() {

    const button =
        document.getElementById(
            "logoutButton"
        );

    if (button) {

        button.disabled = true;

        button.textContent =
            "Logging out...";
    }

    const { error } =
        await supabaseClient
            .auth
            .signOut();

    if (error) {

        console.error(error);

        alert(
            "Could not log out. Please try again."
        );

        if (button) {

            button.disabled = false;

            button.textContent =
                "Logout";
        }

        return;
    }

    window.location.href =
        "auth.html";
}


// =========================================================
// MAKE HTML ONCLICK FUNCTIONS GLOBAL
// =========================================================

window.scrollToSection =
    scrollToSection;

window.openProductModal =
    openProductModal;

window.closeProductModal =
    closeProductModal;

window.deleteProduct =
    deleteProduct;

window.openCustomerModal =
    openCustomerModal;

window.closeCustomerModal =
    closeCustomerModal;

window.deleteCustomer =
    deleteCustomer;

window.openSaleModal =
    openSaleModal;

window.closeSaleModal =
    closeSaleModal;

window.deleteSale =
    deleteSale;

window.openInvoiceModal =
    openInvoiceModal;

window.closeInvoiceModal =
    closeInvoiceModal;

window.closeInvoiceViewModal =
    closeInvoiceViewModal;

window.toggleInvoiceStatus =
    toggleInvoiceStatus;

window.deleteInvoice =
    deleteInvoice;

window.viewInvoice =
    viewInvoice;

window.sendContactMessage =
    sendContactMessage;

window.exportBusinessData =
    exportBusinessData;

window.importBusinessData =
    importBusinessData;

window.resetBusinessData =
    resetBusinessData;

window.startProPlan =
    startProPlan;

window.startBusinessPlan =
    startBusinessPlan;

window.logoutUser =
    logoutUser;
window.changePassword =
    changePassword;

window.deleteAccount =
    deleteAccount;

// =========================================================
// START
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    startPATRIODX
);
/* =========================================================
   PATRIODX AI
========================================================= */

const aiForm = document.getElementById("aiForm");
const aiInput = document.getElementById("aiInput");
const aiMessages = document.getElementById("aiMessages");
const aiSendButton = document.getElementById("aiSendButton");


function addAIMessage(message, type = "bot") {

    const messageDiv = document.createElement("div");

    messageDiv.className =
        type === "user"
            ? "ai-message ai-message-user"
            : "ai-message ai-message-bot";

    if (type === "user") {

        messageDiv.innerHTML = `
            <strong>You</strong>
            <p>${message}</p>
        `;

    } else {

        messageDiv.innerHTML = `
            <strong>🤖 PATRIODX AI</strong>
            <p>${message}</p>
        `;

    }

    aiMessages.appendChild(messageDiv);

    aiMessages.scrollTop =
        aiMessages.scrollHeight;
}


if (aiForm) {

    aiForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const message =
            aiInput.value.trim();

        if (!message) {
            return;
        }


        /* Show user's message */

        addAIMessage(
            message,
            "user"
        );


        /* Clear input */

        aiInput.value = "";


        /* Disable button */

        aiSendButton.disabled = true;
        aiSendButton.textContent = "Thinking...";


        /* Temporary loading message */

        const loadingDiv =
            document.createElement("div");

        loadingDiv.className =
            "ai-message ai-message-bot";

        loadingDiv.innerHTML = `
            <strong>🤖 PATRIODX AI</strong>
            <p>Thinking...</p>
        `;

        aiMessages.appendChild(
            loadingDiv
        );


        try {

            /*
             * Get the current Supabase session.
             */

            const {
                data: sessionData
            } =
                await supabaseClient.auth.getSession();


            const session =
                sessionData?.session;


            if (!session) {

                throw new Error(
                    "Please log in to use PATRIODX AI."
                );

            }


            /*
             * Send business data to our
             * secure server endpoint.
             */

            const response =
                await fetch(
                   "https://businessos-wine-eight.vercel.app/api/ai",
                    {
                        method: "POST",

                        headers: {

                            "Content-Type":
                                "application/json",

                            "Authorization":
                                `Bearer ${session.access_token}`

                        },

                        body:
                            JSON.stringify({

                                message:

                                    message,

                                business: {

                                    businessName:
                                        typeof businessName !== "undefined"
                                            ? businessName
                                            : "",

                                    plan:
                                        typeof currentPlan !== "undefined"
                                            ? currentPlan
                                            : "Free",

                                    products:
                                        typeof products !== "undefined"
                                            ? products
                                            : [],

                                    customers:
                                        typeof customers !== "undefined"
                                            ? customers
                                            : [],

                                    sales:
                                        typeof sales !== "undefined"
                                            ? sales
                                            : [],

                                    invoices:
                                        typeof invoices !== "undefined"
                                            ? invoices
                                            : []

                                }

                            })

                    }

                );


            const result =
                await response.json();


            if (!response.ok ||
                !result.status) {

                throw new Error(
                    result.error ||
                    "PATRIODX AI request failed."
                );

            }


            /*
             * Remove loading message.
             */

            loadingDiv.remove();


            /*
             * Display AI response.
             */

            addAIMessage(
                result.answer,
                "bot"
            );


        } catch (error) {

            console.error(
                "PATRIODX AI error:",
                error
            );


            loadingDiv.remove();


            addAIMessage(
                error.message ||
                "Something went wrong while contacting PATRIODX AI.",
                "bot"
            );


        } finally {

            aiSendButton.disabled =
                false;

            aiSendButton.textContent =
                "Ask AI";

            aiInput.focus();

        }

    });

}
/* =========================================================
   PATRIODX SOCIAL 2.0
========================================================= */

const socialPostForm =
    document.getElementById("socialPostForm");

const socialFeed =
    document.getElementById("socialFeed");

const socialImageInput =
    document.getElementById("socialImageInput");

const socialVideoInput =
    document.getElementById("socialVideoInput");

const socialMediaPreview =
    document.getElementById("socialMediaPreview");

let selectedSocialFile = null;


/* =========================================================
   MEDIA PREVIEW
========================================================= */

function showSocialMediaPreview(file) {

    if (!socialMediaPreview) return;

    if (!file) {

        socialMediaPreview.innerHTML = "";
        socialMediaPreview.style.display = "none";

        return;
    }

    selectedSocialFile = file;

    const fileUrl =
        URL.createObjectURL(file);


    if (file.type.startsWith("image/")) {

        socialMediaPreview.innerHTML = `
            <div class="social-preview-container">

                <img
                    src="${fileUrl}"
                    class="social-preview-image"
                    alt="Selected photo"
                >

                <div class="social-preview-info">
                    📷 ${safe(file.name)}
                </div>

                <button
                    type="button"
                    class="social-remove-media"
                    onclick="clearSocialMedia()"
                >
                    Remove
                </button>

            </div>
        `;

    } else if (file.type.startsWith("video/")) {

        socialMediaPreview.innerHTML = `
            <div class="social-preview-container">

                <video
                    src="${fileUrl}"
                    class="social-preview-video"
                    controls
                ></video>

                <div class="social-preview-info">
                    🎥 ${safe(file.name)}
                </div>

                <button
                    type="button"
                    class="social-remove-media"
                    onclick="clearSocialMedia()"
                >
                    Remove
                </button>

            </div>
        `;
    }


    socialMediaPreview.style.display = "block";
}


/* =========================================================
   IMAGE SELECTED
========================================================= */

if (socialImageInput) {

    socialImageInput.addEventListener(
        "change",
        function () {

            const file =
                this.files?.[0];

            if (!file) return;


            if (!file.type.startsWith("image/")) {

                alert(
                    "Please select an image file."
                );

                this.value = "";

                return;
            }


            if (file.size > 10 * 1024 * 1024) {

                alert(
                    "Photo must be smaller than 10 MB."
                );

                this.value = "";

                return;
            }


            if (socialVideoInput) {
                socialVideoInput.value = "";
            }


            showSocialMediaPreview(file);
        }
    );
}


/* =========================================================
   VIDEO SELECTED
========================================================= */

if (socialVideoInput) {

    socialVideoInput.addEventListener(
        "change",
        function () {

            const file =
                this.files?.[0];

            if (!file) return;


            if (!file.type.startsWith("video/")) {

                alert(
                    "Please select a video file."
                );

                this.value = "";

                return;
            }


            if (file.size > 50 * 1024 * 1024) {

                alert(
                    "Video must be smaller than 50 MB."
                );

                this.value = "";

                return;
            }


            if (socialImageInput) {
                socialImageInput.value = "";
            }


            showSocialMediaPreview(file);
        }
    );
}


/* =========================================================
   CLEAR MEDIA
========================================================= */

function clearSocialMedia() {

    selectedSocialFile = null;


    if (socialImageInput) {
        socialImageInput.value = "";
    }


    if (socialVideoInput) {
        socialVideoInput.value = "";
    }


    if (socialMediaPreview) {

        socialMediaPreview.innerHTML = "";

        socialMediaPreview.style.display =
            "none";
    }
}


/* =========================================================
   UPLOAD MEDIA
========================================================= */

async function uploadSocialMedia(file) {

    if (!file || !currentUser) {
        return null;
    }


    const extension =
        file.name
            .split(".")
            .pop()
            .toLowerCase();


    const fileName =
        `${crypto.randomUUID()}.${extension}`;


    const filePath =
        `${currentUser.id}/${fileName}`;


    const { error } =
        await supabaseClient
            .storage
            .from("patriodx-media")
            .upload(
                filePath,
                file,
                {
                    cacheControl: "3600",
                    upsert: false
                }
            );


    if (error) {

        console.error(
            "Media upload error:",
            error
        );

        throw error;
    }


    const { data } =
        supabaseClient
            .storage
            .from("patriodx-media")
            .getPublicUrl(filePath);


    return data.publicUrl;
}


/* =========================================================
   GET POST COUNTS
========================================================= */

async function getSocialCounts(postId) {

    const [
        likesResult,
        commentsResult
    ] = await Promise.all([

        supabaseClient
            .from("post_likes")
            .select(
                "id",
                {
                    count: "exact",
                    head: true
                }
            )
            .eq(
                "post_id",
                postId
            ),

        supabaseClient
            .from("comments")
            .select(
                "id",
                {
                    count: "exact",
                    head: true
                }
            )
            .eq(
                "post_id",
                postId
            )

    ]);


    return {

        likes:
            likesResult.count || 0,

        comments:
            commentsResult.count || 0

    };
}


/* =========================================================
   LOAD SOCIAL POSTS
========================================================= */

async function loadSocialPosts() {

    if (!socialFeed) return;


    socialFeed.innerHTML = `
        <div class="social-empty-state">

            <div>⏳</div>

            <h3>Loading posts...</h3>

            <p>
                Please wait.
            </p>

        </div>
    `;


    const { data: posts, error } =
        await supabaseClient
            .from("posts")
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (error) {

        console.error(
            "Could not load social posts:",
            error
        );

        socialFeed.innerHTML = `
            <div class="social-empty-state">

                <div>⚠️</div>

                <h3>
                    Could not load posts
                </h3>

                <p>
                    ${safe(error.message)}
                </p>

            </div>
        `;

        return;
    }


    if (!posts || posts.length === 0) {

        socialFeed.innerHTML = `
            <div class="social-empty-state">

                <div>🌐</div>

                <h3>
                    No posts yet
                </h3>

                <p>
                    Be the first to share something
                    with the PATRIODX community.
                </p>

            </div>
        `;

        return;
    }


    /*
       Get counts for every post.
    */

    const postsWithCounts =
        await Promise.all(

            posts.map(
                async post => {

                    const counts =
                        await getSocialCounts(
                            post.id
                        );

                    return {
                        ...post,
                        ...counts
                    };

                }
            )
        );


    socialFeed.innerHTML =
        postsWithCounts
            .map(post => {

                const isOwnPost =
                    post.user_id ===
                    currentUser?.id;


                const author =
                    isOwnPost
                        ? (
                            currentBusiness?.name ||
                            currentUser?.user_metadata?.business_name ||
                            currentUser?.user_metadata?.full_name ||
                            currentUser?.email ||
                            "You"
                        )
                        : "PATRIODX User";


                const image =
                    post.image_url
                        ? `
                            <div class="social-media-wrapper">

                                <img
                                    src="${safe(post.image_url)}"
                                    class="social-post-image"
                                    alt="Post image"
                                    loading="lazy"
                                >

                            </div>
                        `
                        : "";


                const video =
                    post.video_url
                        ? `
                            <div class="social-media-wrapper">

                                <video
                                    src="${safe(post.video_url)}"
                                    class="social-post-video"
                                    controls
                                    preload="metadata"
                                ></video>

                            </div>
                        `
                        : "";


                return `

                    <article
                        class="social-post-card"
                        id="social-post-${post.id}"
                    >

                        <!-- POST HEADER -->

                        <div class="social-post-header">

                            <div class="social-post-avatar">
                                👤
                            </div>

                            <div class="social-post-author-area">

                                <div
                                    class="social-post-author"
                                >
                                    ${safe(author)}
                                </div>

                                <div
                                    class="social-post-date"
                                >
                                    ${formatDate(
                                        post.created_at
                                    )}
                                </div>

                            </div>


                            ${
                                isOwnPost
                                    ? `
                                        <button
                                            type="button"
                                            class="social-delete-button"
                                            onclick="deleteSocialPost('${post.id}')"
                                            title="Delete post"
                                        >
                                            🗑️
                                        </button>
                                    `
                                    : `
                                        <button
                                            type="button"
                                            class="social-report-button"
                                            onclick="reportSocialPost('${post.id}')"
                                            title="Report post"
                                        >
                                            🚩
                                        </button>
                                    `
                            }

                        </div>


                        <!-- POST CONTENT -->

                        ${
                            post.content
                                ? `
                                    <div
                                        class="social-post-content"
                                    >
                                        ${safe(
                                            post.content
                                        )}
                                    </div>
                                `
                                : ""
                        }


                        <!-- PHOTO -->

                        ${image}


                        <!-- VIDEO -->

                        ${video}


                        <!-- COUNTS -->

                        <div
                            class="social-post-stats"
                            id="social-stats-${post.id}"
                        >

                            <span>
                                ❤️ ${post.likes}
                            </span>

                            <span>
                                💬 ${post.comments}
                            </span>

                        </div>


                        <!-- ACTIONS -->

                        <div
                            class="social-post-actions-bar"
                        >

                            <button
                                type="button"
                                class="social-action-button"
                                onclick="likeSocialPost('${post.id}')"
                            >
                                ❤️ Like
                            </button>


                            <button
                                type="button"
                                class="social-action-button"
                                onclick="toggleComments('${post.id}')"
                            >
                                💬 Comment
                            </button>


                            <button
                                type="button"
                                class="social-action-button"
                                onclick="shareSocialPost('${post.id}')"
                            >
                                ↗️ Share
                            </button>

                        </div>


                        <!-- COMMENTS -->

                        <div
                            id="comments-${post.id}"
                            class="social-comments"
                            style="display:none;"
                        >

                            <div
                                id="comments-list-${post.id}"
                                class="social-comments-list"
                            >
                                <p>
                                    Loading comments...
                                </p>
                            </div>


                            <form
                                class="social-comment-form"
                                onsubmit="submitSocialComment(event, '${post.id}')"
                            >

                                <input
                                    type="text"
                                    id="comment-input-${post.id}"
                                    placeholder="Write a comment..."
                                    maxlength="1000"
                                    required
                                >

                                <button
                                    type="submit"
                                >
                                    Send
                                </button>

                            </form>

                        </div>

                    </article>

                `;

            })
            .join("");
}


/* =========================================================
   CREATE POST
========================================================= */

if (socialPostForm) {

    socialPostForm.addEventListener(
        "submit",
        async function(event) {

            event.preventDefault();


            if (!currentUser) {

                alert(
                    "Please log in before creating a post."
                );

                return;
            }


            const content =
                document
                    .getElementById(
                        "socialPostContent"
                    )
                    .value
                    .trim();


            if (
                !content &&
                !selectedSocialFile
            ) {

                alert(
                    "Please write something or select a photo/video."
                );

                return;
            }


            const button =
                document.getElementById(
                    "socialPostButton"
                );


            button.disabled = true;

            button.textContent =
                "Uploading...";


            try {

                let imageUrl = null;

                let videoUrl = null;


                if (selectedSocialFile) {

                    const uploadedUrl =
                        await uploadSocialMedia(
                            selectedSocialFile
                        );


                    if (
                        selectedSocialFile.type
                            .startsWith("image/")
                    ) {

                        imageUrl =
                            uploadedUrl;

                    } else {

                        videoUrl =
                            uploadedUrl;

                    }
                }


                const { error } =
                    await supabaseClient
                        .from("posts")
                        .insert({

                            user_id:
                                currentUser.id,

                            business_id:
                                currentBusiness?.id ||
                                null,

                            content:
                                content || null,

                            image_url:
                                imageUrl,

                            video_url:
                                videoUrl

                        });


                if (error) {
                    throw error;
                }


                document
                    .getElementById(
                        "socialPostContent"
                    )
                    .value = "";


                clearSocialMedia();


                button.disabled =
                    false;

                button.textContent =
                    "📢 Post";


                await loadSocialPosts();


            } catch (error) {

                console.error(
                    "Could not create post:",
                    error
                );


                alert(
                    "Could not create your post.\n\n" +
                    error.message
                );


                button.disabled =
                    false;

                button.textContent =
                    "📢 Post";
            }

        }
    );
}


/* =========================================================
   LIKE POST
========================================================= */

async function likeSocialPost(postId) {

    if (!currentUser) {

        alert(
            "Please log in to like posts."
        );

        return;
    }


    const { error } =
        await supabaseClient
            .from("post_likes")
            .insert({

                post_id:
                    postId,

                user_id:
                    currentUser.id

            });


    if (error) {

        if (error.code === "23505") {

            alert(
                "You already liked this post."
            );

        } else {

            console.error(
                "Like error:",
                error
            );

            alert(
                "Could not like this post.\n\n" +
                error.message
            );
        }

        return;
    }


    await refreshSocialPostStats(
        postId
    );
}


/* =========================================================
   REFRESH POST COUNTS
========================================================= */

async function refreshSocialPostStats(postId) {

    const stats =
        await getSocialCounts(
            postId
        );


    const statsElement =
        document.getElementById(
            `social-stats-${postId}`
        );


    if (!statsElement) return;


    statsElement.innerHTML = `

        <span>
            ❤️ ${stats.likes}
        </span>

        <span>
            💬 ${stats.comments}
        </span>

    `;
}


/* =========================================================
   TOGGLE COMMENTS
========================================================= */

async function toggleComments(postId) {

    const commentsBox =
        document.getElementById(
            `comments-${postId}`
        );


    if (!commentsBox) return;


    if (
        commentsBox.style.display === "none" ||
        commentsBox.style.display === ""
    ) {

        commentsBox.style.display =
            "block";

        await loadSocialComments(
            postId
        );

    } else {

        commentsBox.style.display =
            "none";
    }
}


/* =========================================================
   LOAD COMMENTS
========================================================= */

async function loadSocialComments(postId) {

    const commentsList =
        document.getElementById(
            `comments-list-${postId}`
        );


    if (!commentsList) return;


    commentsList.innerHTML =
        "<p>Loading comments...</p>";


    const { data: comments, error } =
        await supabaseClient
            .from("comments")
            .select("*")
            .eq(
                "post_id",
                postId
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );


    if (error) {

        console.error(
            "Could not load comments:",
            error
        );

        commentsList.innerHTML =
            "<p>Could not load comments.</p>";

        return;
    }


    if (!comments || comments.length === 0) {

        commentsList.innerHTML =
            "<p>No comments yet. Be the first!</p>";

        return;
    }


    commentsList.innerHTML =
        comments
            .map(comment => {

                const author =
                    comment.user_id ===
                    currentUser?.id
                        ? "You"
                        : "PATRIODX User";


                return `

                    <div class="social-comment">

                        <div
                            class="social-comment-avatar"
                        >
                            👤
                        </div>

                        <div
                            class="social-comment-content"
                        >

                            <strong>
                                ${safe(author)}
                            </strong>

                            <p>
                                ${safe(
                                    comment.content
                                )}
                            </p>

                            <small>
                                ${formatDate(
                                    comment.created_at
                                )}
                            </small>

                        </div>

                    </div>

                `;

            })
            .join("");


    await refreshSocialPostStats(
        postId
    );
}


/* =========================================================
   SUBMIT COMMENT
========================================================= */

async function submitSocialComment(
    event,
    postId
) {

    event.preventDefault();


    if (!currentUser) {

        alert(
            "Please log in before commenting."
        );

        return;
    }


    const input =
        document.getElementById(
            `comment-input-${postId}`
        );


    if (!input) return;


    const content =
        input.value.trim();


    if (!content) return;


    const form =
        event.target;


    const button =
        form.querySelector(
            "button[type='submit']"
        );


    button.disabled = true;

    button.textContent =
        "Sending...";


    const { error } =
        await supabaseClient
            .from("comments")
            .insert({

                post_id:
                    postId,

                user_id:
                    currentUser.id,

                content:
                    content

            });


    if (error) {

        console.error(
            "Comment error:",
            error
        );

        alert(
            "Could not add comment.\n\n" +
            error.message
        );

        button.disabled = false;

        button.textContent =
            "Send";

        return;
    }


    input.value = "";

    button.disabled = false;

    button.textContent =
        "Send";


    await loadSocialComments(
        postId
    );
}


/* =========================================================
   DELETE OWN POST
========================================================= */

async function deleteSocialPost(postId) {

    if (!currentUser) return;


    const confirmed =
        confirm(
            "Delete this post?\n\nThis cannot be undone."
        );


    if (!confirmed) return;


    const { data: post, error: postError } =
        await supabaseClient
            .from("posts")
            .select(
                "id,user_id,image_url,video_url"
            )
            .eq(
                "id",
                postId
            )
            .single();


    if (postError) {

        alert(
            "Could not find this post."
        );

        return;
    }


    if (
        post.user_id !==
        currentUser.id
    ) {

        alert(
            "You can only delete your own posts."
        );

        return;
    }


    const { error } =
        await supabaseClient
            .from("posts")
            .delete()
            .eq(
                "id",
                postId
            )
            .eq(
                "user_id",
                currentUser.id
            );


    if (error) {

        console.error(
            "Delete post error:",
            error
        );

        alert(
            "Could not delete post.\n\n" +
            error.message
        );

        return;
    }


    /*
       Remove the media file from storage.
       The post is already deleted even if
       storage cleanup fails.
    */

    try {

        const mediaUrl =
            post.image_url ||
            post.video_url;


        if (mediaUrl) {

            const marker =
                "/patriodx-media/";

            const index =
                mediaUrl.indexOf(marker);


            if (index !== -1) {

                const filePath =
                    mediaUrl
                        .substring(
                            index +
                            marker.length
                        );


                await supabaseClient
                    .storage
                    .from("patriodx-media")
                    .remove([
                        filePath
                    ]);
            }
        }

    } catch (storageError) {

        console.warn(
            "Media cleanup failed:",
            storageError
        );
    }


    await loadSocialPosts();
}


/* =========================================================
   REPORT POST
========================================================= */

async function reportSocialPost(postId) {

    if (!currentUser) {

        alert(
            "Please log in to report posts."
        );

        return;
    }


    const reason =
        prompt(
            "Why are you reporting this post?\n\n" +
            "Examples: Spam, Scam, Harassment, " +
            "Inappropriate content, Other"
        );


    if (!reason) return;


    const cleanReason =
        reason.trim();


    if (!cleanReason) return;


    const { error } =
        await supabaseClient
            .from("reports")
            .insert({

                user_id:
                    currentUser.id,

                type:
                    "post",

                reason:
                    cleanReason,

                related_id:
                    postId

            });


    if (error) {

        console.error(
            "Report error:",
            error
        );

        alert(
            "Could not submit report.\n\n" +
            error.message
        );

        return;
    }


    alert(
        "🚩 Report submitted.\n\n" +
        "Thank you for helping keep PATRIODX safe."
    );
}


/* =========================================================
   SHARE POST
========================================================= */

async function shareSocialPost(postId) {

    const shareUrl =
        `${window.location.origin}${window.location.pathname}#social-post-${postId}`;


    const shareData = {

        title:
            "PATRIODX Social",

        text:
            "Check out this post on PATRIODX.",

        url:
            shareUrl
    };


    try {

        if (navigator.share) {

            await navigator.share(
                shareData
            );

            return;
        }


        await navigator.clipboard.writeText(
            shareUrl
        );


        alert(
            "🔗 Post link copied to clipboard!"
        );

    } catch (error) {

        if (
            error.name ===
            "AbortError"
        ) {
            return;
        }


        console.error(
            "Share error:",
            error
        );

        alert(
            "Could not share this post."
        );
    }
}


/* =========================================================
   START SOCIAL
========================================================= */

if (socialFeed) {

    loadSocialPosts();
}


/* =========================================================
   GLOBAL FUNCTIONS
========================================================= */

window.likeSocialPost =
    likeSocialPost;

window.toggleComments =
    toggleComments;

window.submitSocialComment =
    submitSocialComment;

window.shareSocialPost =
    shareSocialPost;

window.clearSocialMedia =
    clearSocialMedia;

window.deleteSocialPost =
    deleteSocialPost;

window.reportSocialPost =
    reportSocialPost;
/* =========================================================
   PATRIODX MESSAGING
========================================================= */

const conversationList =
    document.getElementById("conversationList");

const messageList =
    document.getElementById("messageList");

const messageForm =
    document.getElementById("messageForm");

const messageInput =
    document.getElementById("messageInput");

const messageSendButton =
    document.getElementById("messageSendButton");

const newConversationButton =
    document.getElementById("newConversationButton");

let activeConversationId = null;

let messagingRealtimeChannel = null;


/* =========================================================
   LOAD CONVERSATIONS
========================================================= */

async function loadConversations() {

    if (!conversationList || !currentUser) {
        return;
    }


    conversationList.innerHTML = `
        <div class="messaging-empty-state">
            <div>⏳</div>
            <p>Loading conversations...</p>
        </div>
    `;


    const { data: memberships, error } =
        await supabaseClient
            .from("conversation_members")
            .select("conversation_id")
            .eq(
                "user_id",
                currentUser.id
            );


    if (error) {

        console.error(
            "Could not load conversation memberships:",
            error
        );

        conversationList.innerHTML = `
            <div class="messaging-empty-state">
                <div>⚠️</div>
                <p>Could not load conversations.</p>
            </div>
        `;

        return;
    }


    if (
        !memberships ||
        memberships.length === 0
    ) {

        conversationList.innerHTML = `
            <div class="messaging-empty-state">
                <div>💬</div>

                <h3>
                    No conversations
                </h3>

                <p>
                    Start a conversation with
                    someone on PATRIODX.
                </p>

            </div>
        `;

        return;
    }


    const conversationIds =
        memberships.map(
            member =>
                member.conversation_id
        );


    const { data: conversations, error: conversationsError } =
        await supabaseClient
            .from("conversations")
            .select("*")
            .in(
                "id",
                conversationIds
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (conversationsError) {

        console.error(
            "Could not load conversations:",
            conversationsError
        );

        conversationList.innerHTML = `
            <div class="messaging-empty-state">
                <div>⚠️</div>
                <p>
                    Could not load conversations.
                </p>
            </div>
        `;

        return;
    }


    if (
        !conversations ||
        conversations.length === 0
    ) {

        conversationList.innerHTML = `
            <div class="messaging-empty-state">
                <div>💬</div>
                <h3>No conversations</h3>
                <p>
                    Start a conversation with
                    someone on PATRIODX.
                </p>
            </div>
        `;

        return;
    }


    conversationList.innerHTML =
        conversations.map(
            conversation => {

               const name =
    "PATRIODX Conversation";

                return `
                   <div
    class="conversation-item ${
        activeConversationId === conversation.id
            ? "active"
            : ""
    }"
    data-conversation-id="${conversation.id}"
>
                        <div class="conversation-avatar">
                            💬
                        </div>

                        <div class="conversation-info">

                            <div class="conversation-name">
                                ${safe(name)}
                            </div>

                            <div class="conversation-preview">
                                Open conversation
                            </div>

                        </div>

                    </div>
                `;

            }
             ).join("");


    conversationList
        .querySelectorAll(".conversation-item")
        .forEach(item => {

            item.addEventListener(
                "click",
                function() {

                    const conversationId =
                        this.dataset.conversationId;

                    if (!conversationId) {
                        return;
                    }

                    openConversation(
                        conversationId
                    );

                }
            );

        });

}

/* =========================================================
   OPEN CONVERSATION
========================================================= */

async function openConversation(
    conversationId
) {

    activeConversationId =
        conversationId;


    await loadConversations();


    messageInput.disabled = false;
    messageSendButton.disabled = false;


    const { data: conversation, error } =
        await supabaseClient
            .from("conversations")
            .select("*")
            .eq(
                "id",
                conversationId
            )
            .single();


    if (error) {

        console.error(
            "Could not open conversation:",
            error
        );

        return;
    }


    const title =
    "PATRIODX Conversation";

    document.getElementById(
        "chatHeader"
    ).innerHTML = `

        <div>

            <h3>
                ${safe(title)}
            </h3>

            <p>
                PATRIODX conversation
            </p>

        </div>

    `;


    await loadMessages(
        conversationId
    );


    subscribeToMessages(
        conversationId
    );

}


/* =========================================================
   LOAD MESSAGES
========================================================= */

async function loadMessages(
    conversationId
) {

    if (!messageList) return;


    messageList.innerHTML = `
        <div class="messaging-empty-state">
            <div>⏳</div>
            <p>Loading messages...</p>
        </div>
    `;


    const { data: messages, error } =
        await supabaseClient
            .from("messages")
            .select("*")
            .eq(
                "conversation_id",
                conversationId
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );


    if (error) {

        console.error(
            "Could not load messages:",
            error
        );

        messageList.innerHTML = `
            <div class="messaging-empty-state">
                <div>⚠️</div>
                <p>
                    Could not load messages.
                </p>
            </div>
        `;

        return;
    }


    if (
        !messages ||
        messages.length === 0
    ) {

        messageList.innerHTML = `
            <div class="messaging-empty-state">
                <div>💬</div>

                <h3>
                    No messages yet
                </h3>

                <p>
                    Send the first message.
                </p>

            </div>
        `;

        return;
    }


    messageList.innerHTML =
        messages.map(
            message => {

                const mine =
                    message.sender_id ===
                    currentUser.id;


                return `
                    <div
                        class="message-bubble ${
                            mine
                                ? "mine"
                                : "theirs"
                        }"
                    >

                        <div>
                            ${safe(message.content)}
                        </div>

                        <span class="message-time">
                            ${formatDate(
                                message.created_at
                            )}
                        </span>

                    </div>
                `;

            }
        ).join("");


    messageList.scrollTop =
        messageList.scrollHeight;

}


/* =========================================================
   SEND MESSAGE
========================================================= */

if (messageForm) {

    messageForm.addEventListener(
        "submit",
        async function(event) {

            event.preventDefault();


            if (!currentUser) {

                alert(
                    "Please log in before sending messages."
                );

                return;
            }


            if (!activeConversationId) {

                alert(
                    "Please select a conversation first."
                );

                return;
            }


            const content =
                messageInput.value.trim();


            if (!content) return;


            messageSendButton.disabled =
                true;


            const { error } =
                await supabaseClient
                    .from("messages")
                    .insert({

                        conversation_id:
                            activeConversationId,

                        sender_id:
                            currentUser.id,

                        content:
                            content

                    });


            if (error) {

                console.error(
                    "Could not send message:",
                    error
                );

                alert(
                    "Could not send message.\n\n" +
                    error.message
                );

                messageSendButton.disabled =
                    false;

                return;
            }


            messageInput.value = "";


            messageSendButton.disabled =
                false;


            await loadMessages(
                activeConversationId
            );

        }
    );

}


/* =========================================================
   REALTIME MESSAGES
========================================================= */

function subscribeToMessages(
    conversationId
) {

    if (messagingRealtimeChannel) {

        supabaseClient.removeChannel(
            messagingRealtimeChannel
        );

    }


    messagingRealtimeChannel =
        supabaseClient
            .channel(
                `messages-${conversationId}`
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter:
                        `conversation_id=eq.${conversationId}`
                },
                function(payload) {

                    if (
                        activeConversationId ===
                        conversationId
                    ) {

                        loadMessages(
                            conversationId
                        );

                    }

                }
            )
            .subscribe();

}

/* =========================================================
   NEW CONVERSATION
========================================================= */

if (newConversationButton) {

    newConversationButton.addEventListener(
        "click",
        async function() {

            if (!currentUser) {

                alert(
                    "Please log in first."
                );

                return;
            }

            /* Generate the conversation ID ourselves */
            const conversationId =
                crypto.randomUUID();

            /* Create conversation */
            const { error: conversationError } =
                await supabaseClient
                    .from("conversations")
                    .insert({
                        id: conversationId
                    });

            if (conversationError) {

                console.error(
                    "Could not create conversation:",
                    conversationError
                );

                alert(
                    "Could not create conversation.\n\n" +
                    conversationError.message
                );

                return;
            }

            /* Add current user as a member */
            const { error: memberError } =
                await supabaseClient
                    .from("conversation_members")
                    .insert({
                        conversation_id:
                            conversationId,

                        user_id:
                            currentUser.id
                    });

            if (memberError) {

                console.error(
                    "Could not add conversation member:",
                    memberError
                );

                alert(
                    "Conversation was created, but you could not be added.\n\n" +
                    memberError.message
                );

                return;
            }

            /* Reload conversations */
            await loadConversations();

            /* Open the new conversation */
            await openConversation(
                conversationId
            );

        }
    );

}
/* =========================================================
   START MESSAGING
========================================================= */

if (
    conversationList &&
    currentUser
) {

    loadConversations();

}


/* =========================================================
   MAKE FUNCTIONS AVAILABLE
========================================================= */

window.openConversation =
    openConversation;
/* =========================================================
   PATRIODX NOTIFICATIONS
========================================================= */

const notificationList =
    document.getElementById("notificationList");

const notificationStatus =
    document.getElementById("notificationStatus");

const markAllNotificationsButton =
    document.getElementById(
        "markAllNotificationsButton"
    );


/* ---------------------------------------------------------
   LOAD NOTIFICATIONS
--------------------------------------------------------- */

async function loadNotifications() {

    if (!currentUser) {

        if (notificationStatus) {
            notificationStatus.textContent =
                "Please log in to view your notifications.";
        }

        return;
    }

    const { data, error } =
        await supabaseClient
            .from("notifications")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", {
                ascending: false
            });

    if (error) {

        console.error(
            "Could not load notifications:",
            error
        );

        if (notificationStatus) {
            notificationStatus.textContent =
                "Could not load notifications.";
        }

        return;
    }

    renderNotifications(data || []);
}


/* ---------------------------------------------------------
   RENDER NOTIFICATIONS
--------------------------------------------------------- */

function renderNotifications(
    notifications
) {

    if (!notificationList) {
        return;
    }

    if (!notifications.length) {

        notificationList.innerHTML = `
            <div class="notifications-empty-state">
                <div>🔔</div>
                <h3>No notifications yet</h3>
                <p>
                    Your notifications will appear here.
                </p>
            </div>
        `;

        if (notificationStatus) {
            notificationStatus.textContent =
                "You're all caught up.";
        }

        return;
    }


    notificationList.innerHTML =
        notifications
            .map(notification => {

                const isUnread =
                    notification.is_read !== true;

                let icon = "🔔";

                if (notification.type === "like") {
                    icon = "❤️";
                }

                if (notification.type === "comment") {
                    icon = "💬";
                }

                if (notification.type === "message") {
                    icon = "✉️";
                }

                if (notification.type === "sale") {
                    icon = "🛒";
                }

                if (notification.type === "system") {
                    icon = "⚙️";
                }

                const createdAt =
                    notification.created_at
                        ? new Date(
                            notification.created_at
                        ).toLocaleString()
                        : "";

                return `
                    <div
                        class="notification-item ${
                            isUnread ? "unread" : ""
                        }"
                    >

                        <div class="notification-icon">
                            ${icon}
                        </div>

                        <div class="notification-content">

                            <h4>
                                ${
                                    notification.title ||
                                    "PATRIODX Notification"
                                }
                            </h4>

                            <p>
                                ${
                                    notification.message ||
                                    "You have a new notification."
                                }
                            </p>

                            <span class="notification-time">
                                ${createdAt}
                            </span>

                        </div>

                        ${
                            isUnread
                                ? `
                                    <button
                                        type="button"
                                        class="notification-read-button"
                                        onclick="markNotificationRead('${notification.id}')"
                                    >
                                        Mark read
                                    </button>
                                `
                                : ""
                        }

                    </div>
                `;

            })
            .join("");


    const unreadCount =
        notifications.filter(
            notification =>
                notification.is_read !== true
        ).length;

    if (notificationStatus) {

        notificationStatus.textContent =
            unreadCount > 0
                ? `${unreadCount} unread notification${
                    unreadCount === 1 ? "" : "s"
                }`
                : "You're all caught up.";
    }
}


/* ---------------------------------------------------------
   MARK ONE AS READ
--------------------------------------------------------- */

async function markNotificationRead(
    notificationId
) {

    if (!currentUser) {
        return;
    }

    const { error } =
        await supabaseClient
            .from("notifications")
            .update({
                is_read: true
            })
            .eq("id", notificationId)
            .eq("user_id", currentUser.id);

    if (error) {

        console.error(
            "Could not mark notification as read:",
            error
        );

        alert(
            "Could not mark notification as read.\n\n" +
            error.message
        );

        return;
    }

    await loadNotifications();
}


/* ---------------------------------------------------------
   MARK ALL AS READ
--------------------------------------------------------- */

if (markAllNotificationsButton) {

    markAllNotificationsButton.addEventListener(
        "click",
        async function() {

            if (!currentUser) {
                return;
            }

            const { error } =
                await supabaseClient
                    .from("notifications")
                    .update({
                        is_read: true
                    })
                    .eq(
                        "user_id",
                        currentUser.id
                    )
                    .eq(
                        "is_read",
                        false
                    );

            if (error) {

                console.error(
                    "Could not mark all notifications as read:",
                    error
                );

                alert(
                    "Could not mark notifications as read.\n\n" +
                    error.message
                );

                return;
            }

            await loadNotifications();

        }
    );

}


/* ---------------------------------------------------------
   LOAD NOTIFICATIONS
--------------------------------------------------------- */

if (currentUser) {
    loadNotifications();
}


/* ---------------------------------------------------------
   REALTIME NOTIFICATIONS
--------------------------------------------------------- */

if (currentUser) {

    supabaseClient
        .channel(
            "patriodx-notifications-" +
            currentUser.id
        )
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "notifications",
                filter:
                    "user_id=eq." +
                    currentUser.id
            },
            function() {

                loadNotifications();

            }
        )
        .subscribe();

}


/* ---------------------------------------------------------
   GLOBAL FUNCTION
--------------------------------------------------------- */

window.markNotificationRead =
    markNotificationRead;
/* =========================================================
   PATRIODX PROFILE / IDENTITY SYSTEM
========================================================= */

const profileForm =
    document.getElementById("profileForm");

const editProfileButton =
    document.getElementById("editProfileButton");

const cancelProfileButton =
    document.getElementById("cancelProfileButton");

const profileEditor =
    document.getElementById("profileEditor");

const profileUsernameInput =
    document.getElementById("profileUsernameInput");

const profileDisplayNameInput =
    document.getElementById("profileDisplayNameInput");

const profileBioInput =
    document.getElementById("profileBioInput");

const profileAvatarInput =
    document.getElementById("profileAvatarInput");

const profileDisplayName =
    document.getElementById("profileDisplayName");

const profileUsername =
    document.getElementById("profileUsername");

const profileBio =
    document.getElementById("profileBio");

const profileAvatar =
    document.getElementById("profileAvatar");

const profilePosts =
    document.getElementById("profilePosts");

const profilePostCount =
    document.getElementById("profilePostCount");

let currentProfile = null;


/* =========================================================
   LOAD PROFILE
========================================================= */

async function loadMyProfile() {

    if (!currentUser) return;


    const { data: profile, error } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq(
                "id",
                currentUser.id
            )
            .maybeSingle();


    if (error) {

        console.error(
            "Profile loading error:",
            error
        );

        return;
    }


    currentProfile =
        profile;


    /*
       If profile doesn't exist,
       automatically create a basic one.
    */

    if (!profile) {

        const defaultName =
            currentUser.user_metadata?.full_name ||
            currentUser.email?.split("@")[0] ||
            "PATRIODX User";


        const { data: newProfile, error: createError } =
            await supabaseClient
                .from("profiles")
                .insert({

                    id:
                        currentUser.id,

                    display_name:
                        defaultName

                })
                .select()
                .single();


        if (createError) {

            console.error(
                "Could not create profile:",
                createError
            );

            return;
        }


        currentProfile =
            newProfile;
    }


    renderMyProfile();

    await loadMyProfilePosts();
}


/* =========================================================
   RENDER PROFILE
========================================================= */

function renderMyProfile() {

    if (!currentProfile) return;


    const displayName =
        currentProfile.display_name ||
        "PATRIODX User";


    const username =
        currentProfile.username ||
        "username";


    const bio =
        currentProfile.bio ||
        "Welcome to PATRIODX.";


    if (profileDisplayName) {

        profileDisplayName.textContent =
            displayName;
    }


    if (profileUsername) {

        profileUsername.textContent =
            `@${username}`;
    }


    if (profileBio) {

        profileBio.textContent =
            bio;
    }


    if (profileAvatar) {

        if (currentProfile.avatar_url) {

            profileAvatar.innerHTML = `

                <img
                    src="${safe(currentProfile.avatar_url)}"
                    alt="Profile picture"
                >

            `;

        } else {

            profileAvatar.innerHTML =
                "👤";
        }
    }
}


/* =========================================================
   OPEN EDIT PROFILE
========================================================= */

if (editProfileButton) {

    editProfileButton.addEventListener(
        "click",
        function () {

            if (!currentProfile) return;


            profileUsernameInput.value =
                currentProfile.username || "";


            profileDisplayNameInput.value =
                currentProfile.display_name || "";


            profileBioInput.value =
                currentProfile.bio || "";


            profileEditor.style.display =
                "block";


            profileEditor.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

        }
    );
}


/* =========================================================
   CANCEL EDIT
========================================================= */

if (cancelProfileButton) {

    cancelProfileButton.addEventListener(
        "click",
        function () {

            profileEditor.style.display =
                "none";

        }
    );
}


/* =========================================================
   USERNAME VALIDATION
========================================================= */

function validatePATRIODXUsername(username) {

    /*
       Username rules:

       3–30 characters
       letters
       numbers
       underscore
       period
    */

    const usernameRegex =
        /^[a-zA-Z0-9_.]{3,30}$/;


    return usernameRegex.test(
        username
    );
}


/* =========================================================
   CHECK USERNAME AVAILABILITY
========================================================= */

async function checkPATRIODXUsername(
    username
) {

    const normalized =
        username
            .trim()
            .toLowerCase();


    const { data, error } =
        await supabaseClient
            .from("profiles")
            .select("id")
            .ilike(
                "username",
                normalized
            )
            .neq(
                "id",
                currentUser.id
            )
            .limit(1);


    if (error) {

        console.error(
            "Username check error:",
            error
        );

        throw error;
    }


    return !data || data.length === 0;
}


/* =========================================================
   UPLOAD PROFILE PHOTO
========================================================= */

async function uploadProfileAvatar(file) {

    if (!file || !currentUser) {
        return null;
    }


    if (
        !file.type.startsWith("image/")
    ) {

        throw new Error(
            "Profile picture must be an image."
        );
    }


    if (
        file.size >
        5 * 1024 * 1024
    ) {

        throw new Error(
            "Profile picture must be smaller than 5 MB."
        );
    }


    const extension =
        file.name
            .split(".")
            .pop()
            .toLowerCase();


    const fileName =
        `avatar-${crypto.randomUUID()}.${extension}`;


    const filePath =
        `${currentUser.id}/profile/${fileName}`;


    const { error } =
        await supabaseClient
            .storage
            .from("patriodx-media")
            .upload(
                filePath,
                file,
                {
                    cacheControl: "3600",
                    upsert: false
                }
            );


    if (error) {

        console.error(
            "Profile avatar upload error:",
            error
        );

        throw error;
    }


    const { data } =
        supabaseClient
            .storage
            .from("patriodx-media")
            .getPublicUrl(
                filePath
            );


    return data.publicUrl;
}


/* =========================================================
   SAVE PROFILE
========================================================= */

if (profileForm) {

    profileForm.addEventListener(
        "submit",
        async function(event) {

            event.preventDefault();


            if (!currentUser) {

                alert(
                    "Please log in first."
                );

                return;
            }


            const username =
                profileUsernameInput.value
                    .trim()
                    .toLowerCase();


            const displayName =
                profileDisplayNameInput.value
                    .trim();


            const bio =
                profileBioInput.value
                    .trim();


            if (
                !validatePATRIODXUsername(
                    username
                )
            ) {

                alert(
                    "Username must be 3–30 characters and can only contain letters, numbers, underscores, and periods."
                );

                return;
            }


            if (!displayName) {

                alert(
                    "Please enter a display name."
                );

                return;
            }


            const saveButton =
                document.getElementById(
                    "saveProfileButton"
                );


            saveButton.disabled =
                true;

            saveButton.textContent =
                "Saving...";


            try {

                /*
                   Check username availability
                */

                const available =
                    await checkPATRIODXUsername(
                        username
                    );


                if (!available) {

                    alert(
                        `@${username} is already taken. Please choose another username.`
                    );

                    saveButton.disabled =
                        false;

                    saveButton.textContent =
                        "Save Profile";

                    return;
                }


                /*
                   Upload new avatar if selected
                */

                let avatarUrl =
                    currentProfile?.avatar_url ||
                    null;


                const avatarFile =
                    profileAvatarInput?.files?.[0];


                if (avatarFile) {

                    avatarUrl =
                        await uploadProfileAvatar(
                            avatarFile
                        );
                }


                /*
                   Save profile
                */

                const { data, error } =
                    await supabaseClient
                        .from("profiles")
                        .upsert({

                            id:
                                currentUser.id,

                            username:
                                username,

                            display_name:
                                displayName,

                            avatar_url:
                                avatarUrl,

                            bio:
                                bio

                        })
                        .select()
                        .single();


                if (error) {

                    /*
                       Unique username race-condition
                    */

                    if (
                        error.code === "23505"
                    ) {

                        throw new Error(
                            "That username was just taken. Please choose another."
                        );
                    }


                    throw error;
                }


                currentProfile =
                    data;


                renderMyProfile();


                profileEditor.style.display =
                    "none";


                profileAvatarInput.value =
                    "";


                alert(
                    "✅ Your PATRIODX profile has been updated!"
                );


                await loadMyProfilePosts();


            } catch (error) {

                console.error(
                    "Profile save error:",
                    error
                );


                alert(
                    "Could not save your profile.\n\n" +
                    error.message
                );

            } finally {

                saveButton.disabled =
                    false;

                saveButton.textContent =
                    "Save Profile";
            }

        }
    );
}


/* =========================================================
   LOAD MY POSTS
========================================================= */

async function loadMyProfilePosts() {

    if (
        !currentUser ||
        !profilePosts
    ) {
        return;
    }


    profilePosts.innerHTML = `
        <div class="social-empty-state">

            <div>⏳</div>

            <h3>
                Loading your posts...
            </h3>

        </div>
    `;


    const { data: posts, error } =
        await supabaseClient
            .from("posts")
            .select("*")
            .eq(
                "user_id",
                currentUser.id
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (error) {

        console.error(
            "Profile posts error:",
            error
        );

        profilePosts.innerHTML = `
            <div class="social-empty-state">

                <div>⚠️</div>

                <h3>
                    Could not load your posts
                </h3>

                <p>
                    ${safe(error.message)}
                </p>

            </div>
        `;

        return;
    }


    if (!posts || posts.length === 0) {

        profilePosts.innerHTML = `
            <div class="social-empty-state">

                <div>📝</div>

                <h3>
                    No posts yet
                </h3>

                <p>
                    Your posts will appear here.
                </p>

            </div>
        `;


        if (profilePostCount) {

            profilePostCount.textContent =
                "0";
        }

        return;
    }


    if (profilePostCount) {

        profilePostCount.textContent =
            posts.length;
    }


    profilePosts.innerHTML =
        posts
            .map(post => {

                const image =
                    post.image_url
                        ? `
                            <img
                                src="${safe(post.image_url)}"
                                class="social-post-image"
                                alt="Post image"
                                loading="lazy"
                            >
                        `
                        : "";


                const video =
                    post.video_url
                        ? `
                            <video
                                src="${safe(post.video_url)}"
                                class="social-post-video"
                                controls
                                preload="metadata"
                            ></video>
                        `
                        : "";


                return `

                    <article
                        class="social-post-card"
                    >

                        <div
                            class="social-post-header"
                        >

                            <div
                                class="social-post-avatar"
                            >
                                ${
                                    currentProfile?.avatar_url
                                        ? `
                                            <img
                                                src="${safe(currentProfile.avatar_url)}"
                                                alt="Profile"
                                                style="
                                                    width:100%;
                                                    height:100%;
                                                    object-fit:cover;
                                                    border-radius:50%;
                                                "
                                            >
                                        `
                                        : "👤"
                                }
                            </div>


                            <div>

                                <div
                                    class="social-post-author"
                                >
                                    ${safe(
                                        currentProfile?.display_name ||
                                        "PATRIODX User"
                                    )}
                                </div>


                                <div
                                    class="social-post-date"
                                >
                                    ${formatDate(
                                        post.created_at
                                    )}
                                </div>

                            </div>

                        </div>


                        ${
                            post.content
                                ? `
                                    <div
                                        class="social-post-content"
                                    >
                                        ${safe(
                                            post.content
                                        )}
                                    </div>
                                `
                                : ""
                        }


                        ${image}

                        ${video}

                    </article>

                `;

            })
            .join("");
}


/* =========================================================
   INITIALIZE PROFILE
========================================================= */

async function initializePATRIODXProfile() {

    if (!currentUser) return;

    await loadMyProfile();
}


/* =========================================================
   MAKE PROFILE FUNCTIONS AVAILABLE
========================================================= */

window.loadMyProfile =
    loadMyProfile;

window.initializePATRIODXProfile =
    initializePATRIODXProfile;
document.addEventListener("DOMContentLoaded", function () {
    const editButton = document.getElementById("editProfileButton");
    const profileEditor = document.getElementById("profileEditor");
    const cancelButton = document.getElementById("cancelProfileButton");

    if (editButton && profileEditor) {
        editButton.addEventListener("click", function () {
            profileEditor.style.display = "block";
            profileEditor.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    }

    if (cancelButton && profileEditor) {
        cancelButton.addEventListener("click", function () {
            profileEditor.style.display = "none";
        });
    }
});
// ==========================================
// PATRIODX PROFILE EDIT BUTTON
// ==========================================

function openProfileEditor() {
    const editor = document.getElementById("profileEditor");

    if (!editor) {
        alert("Profile editor could not be found.");
        return;
    }

    editor.style.display = "block";

    editor.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function closeProfileEditor() {
    const editor = document.getElementById("profileEditor");

    if (editor) {
        editor.style.display = "none";
    }
}

window.openProfileEditor = openProfileEditor;
window.closeProfileEditor = closeProfileEditor;
// ==========================================
// PATRIODX PUBLIC PROFILES + FOLLOW SYSTEM
// ==========================================

let viewedProfileUserId = null;


// ------------------------------------------
// PROFILE FOLLOW COUNTS
// ------------------------------------------

async function getProfileFollowCounts(userId) {

    const { count: followers } = await supabaseClient
        .from("profile_follows")
        .select("*", {
            count: "exact",
            head: true
        })
        .eq("following_id", userId);

    const { count: following } = await supabaseClient
        .from("profile_follows")
        .select("*", {
            count: "exact",
            head: true
        })
        .eq("follower_id", userId);

    return {
        followers: followers || 0,
        following: following || 0
    };
}


// ------------------------------------------
// LOAD OWN FOLLOW COUNTS
// ------------------------------------------

async function loadMyFollowCounts() {

    if (!currentUser) return;

    const counts = await getProfileFollowCounts(currentUser.id);

    const followersElement =
        document.getElementById("profileFollowerCount");

    const followingElement =
        document.getElementById("profileFollowingCount");

    if (followersElement) {
        followersElement.textContent = counts.followers;
    }

    if (followingElement) {
        followingElement.textContent = counts.following;
    }
}


// ------------------------------------------
// CHECK IF FOLLOWING
// ------------------------------------------

async function isFollowingUser(userId) {

    if (!currentUser || userId === currentUser.id) {
        return false;
    }

    const { data, error } = await supabaseClient
        .from("profile_follows")
        .select("id")
        .eq("follower_id", currentUser.id)
        .eq("following_id", userId)
        .maybeSingle();

    if (error) {
        console.error("Follow check error:", error);
        return false;
    }

    return !!data;
}


// ------------------------------------------
// FOLLOW USER
// ------------------------------------------

async function followUser(userId) {

    if (!currentUser) {
        alert("Please sign in first.");
        return;
    }

    if (userId === currentUser.id) {
        return;
    }

    const button =
        document.getElementById("publicProfileFollowButton");

    if (button) {
        button.disabled = true;
        button.textContent = "Following...";
    }

    const { error } = await supabaseClient
        .from("profile_follows")
        .insert({
            follower_id: currentUser.id,
            following_id: userId
        });

    if (error) {

        console.error("Follow error:", error);

        if (button) {
            button.disabled = false;
            button.textContent = "Follow";
        }

        if (error.code === "23505") {
            alert("You are already following this user.");
        } else {
            alert("Could not follow this user.");
        }

        return;
    }

    await loadPublicProfile(userId);
}


// ------------------------------------------
// UNFOLLOW USER
// ------------------------------------------

async function unfollowUser(userId) {

    if (!currentUser) return;

    const button =
        document.getElementById("publicProfileFollowButton");

    if (button) {
        button.disabled = true;
        button.textContent = "Unfollowing...";
    }

    const { error } = await supabaseClient
        .from("profile_follows")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("following_id", userId);

    if (error) {

        console.error("Unfollow error:", error);

        if (button) {
            button.disabled = false;
            button.textContent = "Following";
        }

        alert("Could not unfollow this user.");

        return;
    }

    await loadPublicProfile(userId);
}


// ------------------------------------------
// LOAD PUBLIC PROFILE
// ------------------------------------------

async function loadPublicProfile(userId) {

    if (!userId) return;

    viewedProfileUserId = userId;

    const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
        console.error("Profile loading error:", error);
        return;
    }

    if (!profile) {
        alert("Profile not found.");
        return;
    }


    const card =
        document.getElementById("publicProfileCard");

    const postsContainer =
        document.getElementById("publicProfilePostsContainer");

    if (card) {
        card.style.display = "block";
    }

    if (postsContainer) {
        postsContainer.style.display = "block";
    }


    const nameElement =
        document.getElementById("publicProfileDisplayName");

    const usernameElement =
        document.getElementById("publicProfileUsername");

    const bioElement =
        document.getElementById("publicProfileBio");

    const avatarElement =
        document.getElementById("publicProfileAvatar");


    if (nameElement) {
        nameElement.textContent =
            profile.display_name || "PATRIODX User";
    }

    if (usernameElement) {
        usernameElement.textContent =
            profile.username
                ? "@" + profile.username
                : "@user";
    }

    if (bioElement) {
        bioElement.textContent =
            profile.bio || "No bio yet.";
    }


    if (avatarElement) {

        if (profile.avatar_url) {

            avatarElement.innerHTML =
                `<img src="${profile.avatar_url}" alt="Profile picture">`;

        } else {

            avatarElement.textContent = "👤";
        }
    }


    // --------------------------------------
    // FOLLOW BUTTON
    // --------------------------------------

    const followButton =
        document.getElementById("publicProfileFollowButton");

    if (followButton) {

        if (currentUser && userId === currentUser.id) {

            followButton.style.display = "none";

        } else {

            followButton.style.display = "inline-block";

            const following =
                await isFollowingUser(userId);

            followButton.textContent =
                following ? "Following" : "Follow";

            followButton.disabled = false;

            followButton.onclick = function () {

                if (following) {
                    unfollowUser(userId);
                } else {
                    followUser(userId);
                }

            };
        }
    }


    // --------------------------------------
    // FOLLOW COUNTS
    // --------------------------------------

    const counts =
        await getProfileFollowCounts(userId);

    const followerCount =
        document.getElementById("publicProfileFollowerCount");

    const followingCount =
        document.getElementById("publicProfileFollowingCount");

    if (followerCount) {
        followerCount.textContent = counts.followers;
    }

    if (followingCount) {
        followingCount.textContent = counts.following;
    }


    // --------------------------------------
    // LOAD USER POSTS
    // --------------------------------------

    const { data: posts, error: postsError } =
        await supabaseClient
            .from("posts")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", {
                ascending: false
            });

    if (postsError) {
        console.error("Public profile posts error:", postsError);
        return;
    }


    const postCount =
        document.getElementById("publicProfilePostCount");

    if (postCount) {
        postCount.textContent =
            posts ? posts.length : 0;
    }


    const postsElement =
        document.getElementById("publicProfilePosts");

    if (!postsElement) return;


    if (!posts || posts.length === 0) {

        postsElement.innerHTML = `
            <div class="social-empty-state">
                <div>📝</div>
                <h3>No posts yet</h3>
                <p>This user has not posted anything yet.</p>
            </div>
        `;

        return;
    }


    postsElement.innerHTML = posts.map(post => {

        const date = post.created_at
            ? new Date(post.created_at).toLocaleString()
            : "";

        let media = "";

        if (post.image_url) {
            media = `
                <img
                    src="${post.image_url}"
                    class="social-post-image"
                    alt="Post image"
                >
            `;
        }

        if (post.video_url) {
            media = `
                <video
                    class="social-post-image"
                    controls
                >
                    <source src="${post.video_url}">
                </video>
            `;
        }


        return `
            <article class="social-post-card">

                <div class="social-post-header">

                    <div class="social-post-avatar">
                        ${
                            profile.avatar_url
                            ? `<img src="${profile.avatar_url}" alt="Profile picture">`
                            : "👤"
                        }
                    </div>

                    <div class="social-post-author">

                        <strong>
                            ${escapeHTML(
                                profile.display_name ||
                                "PATRIODX User"
                            )}
                        </strong>

                        <span>
                            ${
                                profile.username
                                ? "@" + escapeHTML(profile.username)
                                : ""
                            }
                        </span>

                    </div>

                    <div class="social-post-date">
                        ${escapeHTML(date)}
                    </div>

                </div>

                <div class="social-post-content">
                    ${escapeHTML(post.content || "")}
                </div>

                ${media}

            </article>
        `;

    }).join("");
}


// ------------------------------------------
// SEARCH USERS
// ------------------------------------------

async function searchPATRIODXUsers(username) {

    const results =
        document.getElementById("profileSearchResults");

    if (!results) return;

    const cleanUsername =
        username.trim().replace(/^@/, "");

    if (!cleanUsername) {

        results.innerHTML = "";

        return;
    }


    results.innerHTML = `
        <div class="social-empty-state">
            <p>Searching...</p>
        </div>
    `;


    const { data, error } =
        await supabaseClient
            .from("profiles")
            .select("id, username, display_name, avatar_url, bio")
            .ilike("username", `%${cleanUsername}%`)
            .limit(10);


    if (error) {

        console.error("Profile search error:", error);

        results.innerHTML = `
            <div class="social-empty-state">
                <p>Could not search profiles.</p>
            </div>
        `;

        return;
    }


    if (!data || data.length === 0) {

        results.innerHTML = `
            <div class="social-empty-state">
                <div>🔎</div>
                <h3>No users found</h3>
                <p>No PATRIODX users matched that username.</p>
            </div>
        `;

        return;
    }


    results.innerHTML = data.map(profile => {

        const avatar = profile.avatar_url
            ? `<img src="${profile.avatar_url}" alt="Profile">`
            : "👤";


        return `
            <div
                class="profile-search-result"
                data-user-id="${profile.id}"
            >

                <div class="profile-search-result-avatar">
                    ${avatar}
                </div>

                <div class="profile-search-result-info">

                    <div class="profile-search-result-name">
                        ${escapeHTML(
                            profile.display_name ||
                            "PATRIODX User"
                        )}
                    </div>

                    <div class="profile-search-result-username">
                        ${
                            profile.username
                            ? "@" + escapeHTML(profile.username)
                            : ""
                        }
                    </div>

                </div>

            </div>
        `;

    }).join("");


    document
        .querySelectorAll(".profile-search-result")
        .forEach(result => {

            result.addEventListener("click", function () {

                const userId =
                    this.getAttribute("data-user-id");

                loadPublicProfile(userId);

                const publicCard =
                    document.getElementById("publicProfileCard");

                if (publicCard) {
                    publicCard.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }

            });

        });
}


// ------------------------------------------
// SEARCH FORM
// ------------------------------------------

function initializeProfileSearch() {

    const form =
        document.getElementById("profileSearchForm");

    const input =
        document.getElementById("profileSearchInput");

    if (!form || !input) return;


    form.addEventListener("submit", async function(event) {

        event.preventDefault();

        await searchPATRIODXUsers(input.value);

    });

}


// ------------------------------------------
// START
// ------------------------------------------

initializeProfileSearch();

if (typeof loadMyFollowCounts === "function") {
    loadMyFollowCounts();
}
/* =========================================================
   PATRIODX SIMPLE APP NAVIGATION
========================================================= */

const PATRIODX_PAGES = [
    "home",
    "dashboard",
    "profile",
    "social",
    "messaging",
    "notifications",
    "analytics",
    "products",
    "customers",
    "sales",
    "invoices",
    "patriodxAI",
    "contact",
    "account"
];

const PATRIODX_EXTRA_SECTIONS = [
    ".features-section",
    ".pricing-section",
    ".final-cta",
    ".stats-grid",
    ".recent-activity",
    ".danger-zone",
    "footer"
];


function patriodxShow(element) {
    if (!element) return;

    element.style.setProperty(
        "display",
        "block",
        "important"
    );

    element.style.setProperty(
        "visibility",
        "visible",
        "important"
    );

    element.style.setProperty(
        "opacity",
        "1",
        "important"
    );
}


function patriodxHide(element) {
    if (!element) return;

    element.style.setProperty(
        "display",
        "none",
        "important"
    );
}


function navigatePATRIODX(page) {

    if (page === "ai") {
        page = "patriodxAI";
    }

    if (!PATRIODX_PAGES.includes(page)) {
        page = "home";
    }


    /* Hide every main app page */

    PATRIODX_PAGES.forEach(id => {

        const element =
            document.getElementById(id);

        patriodxHide(element);

    });


    /* Hide extra sections */

    PATRIODX_EXTRA_SECTIONS.forEach(selector => {

        document
            .querySelectorAll(selector)
            .forEach(element => {

                patriodxHide(element);

            });

    });


    /* Show selected page */

    const selected =
        document.getElementById(page);

    patriodxShow(selected);


    /* Home */

  if (page === "home") {

    document
        .querySelectorAll(
            ".landing-section, .features-section, .pricing-section, .final-cta, footer"
        )
        .forEach(element => {

            patriodxShow(element);

        });

}


    /* Dashboard */

    if (page === "dashboard") {

        document
            .querySelectorAll(
                ".stats-grid, .recent-activity"
            )
            .forEach(element => {

                patriodxShow(element);

            });

    }


    /* Account */

    if (page === "account") {

        document
            .querySelectorAll(
                ".danger-zone"
            )
            .forEach(element => {

                patriodxShow(element);

            });

    }


    /* Active sidebar */

    document
        .querySelectorAll(".sidebar-link")
        .forEach(link => {

            link.classList.remove("active");

            let linkPage =
                link.dataset.page;

            if (linkPage === "ai") {
                linkPage = "patriodxAI";
            }

            if (linkPage === page) {
                link.classList.add("active");
            }

        });


    /* Active mobile navigation */

    document
        .querySelectorAll(".mobile-nav-link")
        .forEach(link => {

            link.classList.remove("active");

            let linkPage =
                (link.getAttribute("href") || "")
                .replace("#", "");

            if (linkPage === "ai") {
                linkPage = "patriodxAI";
            }

            if (linkPage === page) {
                link.classList.add("active");
            }

        });


    /* Update URL */

    history.pushState(
        { page: page },
        "",
        "#" + page
    );


    /* Go to top */

    window.scrollTo(0, 0);


    /* Close mobile sidebar */

    const sidebar =
        document.getElementById(
            "patriodxSidebar"
        );

    if (sidebar) {
        sidebar.classList.remove(
            "mobile-open"
        );
    }

}


/* =========================================================
   OLD scrollToSection COMPATIBILITY
========================================================= */

function scrollToSection(id) {

    if (PATRIODX_PAGES.includes(id)) {

        navigatePATRIODX(id);

        return;
    }


    if (id === "ai") {

        navigatePATRIODX(
            "patriodxAI"
        );

        return;
    }


    const element =
        document.getElementById(id);

    if (element) {

        element.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    }

}


/* =========================================================
   HEADER BUTTONS
========================================================= */

function setupPATRIODXHeaderButtons() {

    const notificationButton =
        document.querySelector(
            '[title="Notifications"]'
        );

    const messageButton =
        document.querySelector(
            '[title="Messages"]'
        );

    const profileButton =
        document.querySelector(
            '[title="Your Profile"]'
        );


    if (notificationButton) {

        notificationButton.onclick =
            function(event) {

                event.preventDefault();

                navigatePATRIODX(
                    "notifications"
                );

            };

    }


    if (messageButton) {

        messageButton.onclick =
            function(event) {

                event.preventDefault();

                navigatePATRIODX(
                    "messaging"
                );

            };

    }


    if (profileButton) {

        profileButton.onclick =
            function(event) {

                event.preventDefault();

                navigatePATRIODX(
                    "profile"
                );

            };

    }

}


/* =========================================================
   SIDEBAR BUTTONS
========================================================= */

function setupPATRIODXLinks() {

    document
        .querySelectorAll(
            ".sidebar-link, .mobile-nav-link"
        )
        .forEach(link => {

            link.onclick =
                function(event) {

                    const href =
                        this.getAttribute(
                            "href"
                        );

                    let page =
                        this.dataset.page ||
                        (href || "").replace(
                            "#",
                            ""
                        );


                    if (page === "ai") {
                        page = "patriodxAI";
                    }


                    if (
                        !PATRIODX_PAGES.includes(
                            page
                        )
                    ) {
                        return;
                    }


                    event.preventDefault();

                    navigatePATRIODX(
                        page
                    );

                };

        });

}


/* =========================================================
   LOGO
========================================================= */

function setupPATRIODXLogo() {

    const logo =
        document.querySelector(
            ".patriodx-logo"
        );

    if (!logo) return;


    logo.onclick =
        function(event) {

            event.preventDefault();

            navigatePATRIODX(
                "home"
            );

        };

}


/* =========================================================
   MOBILE MENU
========================================================= */

function setupPATRIODXMobileMenu() {

    const button =
        document.getElementById(
            "mobileMenuButton"
        );

    const sidebar =
        document.getElementById(
            "patriodxSidebar"
        );


    if (!button || !sidebar) {
        return;
    }


    button.onclick =
        function(event) {

            event.preventDefault();

            sidebar.classList.toggle(
                "mobile-open"
            );

        };

}


/* =========================================================
   BROWSER BACK / FORWARD
========================================================= */

window.addEventListener(
    "popstate",
    function() {

        let page =
            window.location.hash
                .replace("#", "");


        if (page === "ai") {
            page = "patriodxAI";
        }


        if (
            !PATRIODX_PAGES.includes(page)
        ) {
            page = "home";
        }


        /* Don't push another history entry */

        const oldPushState =
            history.pushState;

        history.pushState =
            function() {};

        navigatePATRIODX(page);

        history.pushState =
            oldPushState;

    }
);


/* =========================================================
   START NAVIGATION
========================================================= */

function startPATRIODXNavigation() {

    setupPATRIODXHeaderButtons();

    setupPATRIODXLinks();

    setupPATRIODXLogo();

    setupPATRIODXMobileMenu();


    let startingPage =
        window.location.hash
            .replace("#", "");


    if (startingPage === "ai") {
        startingPage = "patriodxAI";
    }


    if (
        !PATRIODX_PAGES.includes(
            startingPage
        )
    ) {
        startingPage = "home";
    }


    /* Initial display without adding history */

    const oldPushState =
        history.pushState;

    history.pushState =
        function() {};

    navigatePATRIODX(
        startingPage
    );

    history.pushState =
        oldPushState;

}


if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        startPATRIODXNavigation,
        { once: true }
    );

} else {

    startPATRIODXNavigation();

}
/* =========================================================
   PATRIODX LANGUAGE SYSTEM
========================================================= */

const PATRIODX_TRANSLATIONS = {

    en: {
        search: "Search PATRIODX...",
        profile: "Profile",
        notifications: "Notifications",
        messages: "Messages",
        logout: "Logout",

        home: "Home",
        dashboard: "Dashboard",
        social: "Social",
        analytics: "Analytics",
        products: "Products",
        customers: "Customers",
        sales: "Sales",
        invoices: "Invoices",
        contact: "Contact",
        account: "Account",
        ai: "PATRIODX AI",

        language: "Language",

        welcome: "Welcome to PATRIODX",
        runBusiness: "Run your business. Grow your money.",
        connect: "Connect. Share. Grow.",

        notificationsTitle: "Notifications",
        messagesTitle: "Messages",
        profileTitle: "Profile",

        noNotifications: "No notifications yet",
        noPosts: "No posts yet",

        contactTitle: "Contact",
        quickLinks: "Quick Links",

        privacy: "Privacy Policy",
        terms: "Terms of Service",
connect: "Connect. Share. Grow.",
socialDescription: "Connect with customers and businesses, share updates and promote what you do.",
createPost: "Create a Post",
photo: "Photo",
video: "Video",
post: "Post",
latestPosts: "Latest Posts",
        main: "MAIN",
business: "BUSINESS",
grow: "GROW",
growWithPatriodx: "Grow with PATRIODX",
unlockTools: "Unlock more business tools.",
viewPlans: "View Plans",
        controlCenter: "PATRIODX • CONTROL CENTER",
runBusinessSmarter: "Run your business smarter.",
dashboardDescription: "Manage your products, customers, sales and invoices from one powerful business dashboard.",
manageProducts: "📦 Manage Products",
viewAnalytics: "📊 View Analytics",

quickActions: "QUICK ACTIONS",
getThingsDoneFaster: "Get things done faster.",

addProduct: "Add Product",
addInventoryItem: "Add something to your inventory",

addCustomer: "Add Customer",
addNewCustomer: "Add a new customer",

recordSale: "Record Sale",
recordTransaction: "Record a new transaction",

createInvoice: "Create Invoice",
sendInvoice: "Send a professional invoice",
        findPeople: "🔎 Find People",
searchByUsername: "Search PATRIODX by username.",
searchUsername: "Search username...",
patriodxProfile: "👤 PATRIODX PROFILE",
yourProfile: "Your Profile",
buildYourIdentity: "Build your identity on PATRIODX.",

follow: "Follow",
posts: "Posts",
followers: "Followers",
following: "Following",

tellPeopleAboutYourself: "Tell people about yourself.",
editProfile: "✏️ Edit Profile",

editYourProfile: "Edit Your Profile",
customizeProfile: "Customize how people see you on PATRIODX.",

username: "Username",
usernamePlaceholder: "username",
uniqueUsername: "Your unique PATRIODX username.",

displayName: "Display Name",
yourName: "Your name",

bio: "Bio",
bioPlaceholder: "Tell people about yourself...",

profilePicture: "Profile Picture",
saveProfile: "Save Profile",
cancel: "Cancel",

yourPosts: "Your Posts",
        allRights: "All rights reserved."
    },

    fr: {
        search: "Rechercher sur PATRIODX...",
        profile: "Profil",
        notifications: "Notifications",
        messages: "Messages",
        logout: "Déconnexion",

        home: "Accueil",
        dashboard: "Tableau de bord",
        social: "Social",
        analytics: "Analyses",
        products: "Produits",
        customers: "Clients",
        sales: "Ventes",
        invoices: "Factures",
        contact: "Contact",
        account: "Compte",
        ai: "PATRIODX IA",

        language: "Langue",

        welcome: "Bienvenue sur PATRIODX",
        runBusiness: "Gérez votre entreprise. Faites fructifier votre argent.",
        connect: "Connectez-vous. Partagez. Développez-vous.",

        notificationsTitle: "Notifications",
        messagesTitle: "Messages",
        profileTitle: "Profil",

        noNotifications: "Aucune notification pour le moment",
        noPosts: "Aucune publication pour le moment",

        contactTitle: "Contact",
        quickLinks: "Liens rapides",

        privacy: "Politique de confidentialité",
        terms: "Conditions d'utilisation",
connect: "Connectez-vous. Partagez. Développez-vous.",
socialDescription: "Connectez-vous avec des clients et des entreprises, partagez des actualités et faites la promotion de vos activités.",
createPost: "Créer une publication",
photo: "Photo",
video: "Vidéo",
post: "Publier",
latestPosts: "Dernières publications",
        main: "PRINCIPAL",
business: "ENTREPRISE",
grow: "DÉVELOPPEMENT",
growWithPatriodx: "Développez-vous avec PATRIODX",
unlockTools: "Débloquez plus d'outils professionnels.",
viewPlans: "Voir les offres",
        controlCenter: "PATRIODX • CENTRE DE CONTRÔLE",
runBusinessSmarter: "Gérez votre entreprise plus intelligemment.",
dashboardDescription: "Gérez vos produits, clients, ventes et factures depuis un puissant tableau de bord.",
manageProducts: "📦 Gérer les produits",
viewAnalytics: "📊 Voir les analyses",

quickActions: "ACTIONS RAPIDES",
getThingsDoneFaster: "Accomplissez vos tâches plus rapidement.",

addProduct: "Ajouter un produit",
addInventoryItem: "Ajoutez un élément à votre inventaire",

addCustomer: "Ajouter un client",
addNewCustomer: "Ajouter un nouveau client",

recordSale: "Enregistrer une vente",
recordTransaction: "Enregistrer une nouvelle transaction",

createInvoice: "Créer une facture",
sendInvoice: "Envoyer une facture professionnelle",
        findPeople: "🔎 Trouver des personnes",
searchByUsername: "Recherchez sur PATRIODX par nom d'utilisateur.",
searchUsername: "Rechercher un nom d'utilisateur...",
patriodxProfile: "👤 PROFIL PATRIODX",
yourProfile: "Votre profil",
buildYourIdentity: "Construisez votre identité sur PATRIODX.",

follow: "Suivre",
posts: "Publications",
followers: "Abonnés",
following: "Abonnements",

tellPeopleAboutYourself: "Parlez de vous aux autres.",
editProfile: "✏️ Modifier le profil",

editYourProfile: "Modifier votre profil",
customizeProfile: "Personnalisez la façon dont les autres vous voient sur PATRIODX.",

username: "Nom d'utilisateur",
usernamePlaceholder: "nom d'utilisateur",
uniqueUsername: "Votre nom d'utilisateur PATRIODX unique.",

displayName: "Nom affiché",
yourName: "Votre nom",

bio: "Biographie",
bioPlaceholder: "Parlez de vous...",

profilePicture: "Photo de profil",
saveProfile: "Enregistrer le profil",
cancel: "Annuler",

yourPosts: "Vos publications",
        allRights: "Tous droits réservés."
    },

    es: {
        search: "Buscar en PATRIODX...",
        profile: "Perfil",
        notifications: "Notificaciones",
        messages: "Mensajes",
        logout: "Cerrar sesión",

        home: "Inicio",
        dashboard: "Panel",
        social: "Social",
        analytics: "Analítica",
        products: "Productos",
        customers: "Clientes",
        sales: "Ventas",
        invoices: "Facturas",
        contact: "Contacto",
        account: "Cuenta",
        ai: "PATRIODX IA",

        language: "Idioma",

        welcome: "Bienvenido a PATRIODX",
        runBusiness: "Administra tu negocio. Haz crecer tu dinero.",
        connect: "Conecta. Comparte. Crece.",

        notificationsTitle: "Notificaciones",
        messagesTitle: "Mensajes",
        profileTitle: "Perfil",

        noNotifications: "Aún no hay notificaciones",
        noPosts: "Aún no hay publicaciones",

        contactTitle: "Contacto",
        quickLinks: "Enlaces rápidos",

        privacy: "Política de privacidad",
        terms: "Términos de servicio",
connect: "Conecta. Comparte. Crece.",
socialDescription: "Conecta con clientes y empresas, comparte novedades y promociona lo que haces.",
createPost: "Crear una publicación",
photo: "Foto",
video: "Vídeo",
post: "Publicar",
latestPosts: "Últimas publicaciones",
        main: "PRINCIPAL",
business: "NEGOCIO",
grow: "CRECER",
growWithPatriodx: "Crece con PATRIODX",
unlockTools: "Desbloquea más herramientas empresariales.",
viewPlans: "Ver planes",
        controlCenter: "PATRIODX • CENTRO DE CONTROL",
runBusinessSmarter: "Gestiona tu negocio de forma más inteligente.",
dashboardDescription: "Gestiona tus productos, clientes, ventas y facturas desde un potente panel de control.",
manageProducts: "📦 Gestionar productos",
viewAnalytics: "📊 Ver analíticas",

quickActions: "ACCIONES RÁPIDAS",
getThingsDoneFaster: "Haz las cosas más rápido.",

addProduct: "Añadir producto",
addInventoryItem: "Añade algo a tu inventario",

addCustomer: "Añadir cliente",
addNewCustomer: "Añadir un nuevo cliente",

recordSale: "Registrar venta",
recordTransaction: "Registrar una nueva transacción",

createInvoice: "Crear factura",
sendInvoice: "Enviar una factura profesional",
        findPeople: "🔎 Buscar personas",
searchByUsername: "Busca en PATRIODX por nombre de usuario.",
searchUsername: "Buscar nombre de usuario...",
patriodxProfile: "👤 PERFIL PATRIODX",
yourProfile: "Tu perfil",
buildYourIdentity: "Construye tu identidad en PATRIODX.",

follow: "Seguir",
posts: "Publicaciones",
followers: "Seguidores",
following: "Siguiendo",

tellPeopleAboutYourself: "Cuéntale a la gente sobre ti.",
editProfile: "✏️ Editar perfil",

editYourProfile: "Editar tu perfil",
customizeProfile: "Personaliza cómo te ven las personas en PATRIODX.",

username: "Nombre de usuario",
usernamePlaceholder: "nombre de usuario",
uniqueUsername: "Tu nombre de usuario único de PATRIODX.",

displayName: "Nombre para mostrar",
yourName: "Tu nombre",

bio: "Biografía",
bioPlaceholder: "Cuéntale a la gente sobre ti...",

profilePicture: "Foto de perfil",
saveProfile: "Guardar perfil",
cancel: "Cancelar",

yourPosts: "Tus publicaciones",
        allRights: "Todos los derechos reservados."
    }

};


/* =========================================================
   CURRENT LANGUAGE
========================================================= */

let PATRIODX_CURRENT_LANGUAGE =
    localStorage.getItem(
        "patriodxLanguage"
    ) || "en";


/* =========================================================
   TRANSLATE ELEMENT
========================================================= */

function patriodxTranslateElement(
    element,
    language
) {

    if (!element) return;

    const key =
        element.dataset.i18n;

    if (!key) return;

    const translations =
        PATRIODX_TRANSLATIONS[language];

    if (!translations) return;

    if (
        Object.prototype.hasOwnProperty.call(
            translations,
            key
        )
    ) {

        element.textContent =
            translations[key];

    }

}


/* =========================================================
   APPLY TRANSLATIONS
========================================================= */

function applyPATRIODXLanguage(
    language
) {

    if (
        !PATRIODX_TRANSLATIONS[language]
    ) {

        language = "en";

    }


    PATRIODX_CURRENT_LANGUAGE =
        language;


    localStorage.setItem(
        "patriodxLanguage",
        language
    );


    document.documentElement.lang =
        language;


    const translations =
        PATRIODX_TRANSLATIONS[language];


    /* Elements using data-i18n */

    document
        .querySelectorAll(
            "[data-i18n]"
        )
        .forEach(element => {

            patriodxTranslateElement(
                element,
                language
            );

        });
document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
    const key = element.dataset.i18nPlaceholder;

    if (
        translations &&
        Object.prototype.hasOwnProperty.call(translations, key)
    ) {
        element.placeholder = translations[key];
    }
});

    /* Search placeholder */

    const searchInput =
        document.getElementById(
            "globalSearchInput"
        );

    if (searchInput) {

        searchInput.placeholder =
            translations.search;

    }


    /* Profile */

    const profileName =
        document.getElementById(
            "headerProfileName"
        );

    if (
        profileName &&
        (
            !profileName.textContent.trim() ||
            profileName.textContent.trim() === "Profile"
        )
    ) {

        profileName.textContent =
            translations.profile;

    }


    /* Language selector */

    const selector =
        document.getElementById(
            "languageSelector"
        );

    if (
        selector &&
        selector.value !== language
    ) {

        selector.value =
            language;

    }

}


/* =========================================================
   LANGUAGE SELECTOR
========================================================= */

function setupPATRIODXLanguageSelector() {

    const selector =
        document.getElementById(
            "languageSelector"
        );


    if (!selector) return;


    if (
        selector.dataset.languageReady ===
        "true"
    ) {
        return;
    }


    selector.dataset.languageReady =
        "true";


    selector.addEventListener(
        "change",
        function() {

            applyPATRIODXLanguage(
                this.value
            );

        }
    );


    applyPATRIODXLanguage(
        PATRIODX_CURRENT_LANGUAGE
    );

}


/* =========================================================
   START LANGUAGE SYSTEM
========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        setupPATRIODXLanguageSelector,
        { once: true }
    );

} else {

    setupPATRIODXLanguageSelector();

}
