import { createClient } from "@supabase/supabase-js";

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Methods",
        "POST, OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed."
        });
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceRoleKey =
            process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            console.error(
                "Marketplace checkout server credentials are missing."
            );

            return res.status(500).json({
                success: false,
                error: "Checkout is temporarily unavailable."
            });
        }

        const authorization =
            req.headers.authorization || "";

        const tokenMatch = authorization.match(
            /^Bearer\s+(.+)$/i
        );

        if (!tokenMatch) {
            return res.status(401).json({
                success: false,
                error: "Please sign in before placing an order."
            });
        }

        const supabase = createClient(
            supabaseUrl,
            serviceRoleKey,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // Verify the customer's actual Supabase session.
        const { data: authData, error: authError } =
            await supabase.auth.getUser(tokenMatch[1]);

        if (authError || !authData.user) {
            return res.status(401).json({
                success: false,
                error: "Your session is invalid. Please sign in again."
            });
        }

        const customer = authData.user;

        const {
            items,
            customer_name,
            shipping_address,
            shipping_city,
            shipping_country
        } = req.body || {};

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Your shopping cart is empty."
            });
        }

        if (items.length > 50) {
            return res.status(400).json({
                success: false,
                error: "Too many different products in one order."
            });
        }

        // Validate and combine duplicate product IDs.
        const quantities = new Map();

        for (const item of items) {
            if (
                !item ||
                typeof item.id !== "string" ||
                !UUID_PATTERN.test(item.id) ||
                !Number.isSafeInteger(item.quantity) ||
                item.quantity < 1 ||
                item.quantity > 20
            ) {
                return res.status(400).json({
                    success: false,
                    error: "One or more cart items are invalid."
                });
            }

            const productId = item.id;
            const newQuantity =
                (quantities.get(productId) || 0) +
                item.quantity;

            if (newQuantity > 20) {
                return res.status(400).json({
                    success: false,
                    error: "The maximum quantity per product is 20."
                });
            }

            quantities.set(productId, newQuantity);
        }

        const productIds = [...quantities.keys()];

        // Always retrieve current prices and stock from the database.
        const { data: products, error: productsError } =
            await supabase
                .from("products")
                .select(
                    "id,business_id,name,price,stock,is_published"
                )
                .in("id", productIds);

        if (productsError) {
            console.error(
                "Marketplace product lookup failed:",
                productsError
            );

            return res.status(500).json({
                success: false,
                error: "We could not validate your cart."
            });
        }

        if (!products || products.length !== productIds.length) {
            return res.status(400).json({
                success: false,
                error: "A product in your cart is no longer available."
            });
        }

        // MVP rule: one seller per order.
        const businessIds = new Set(
            products.map(product => product.business_id)
        );

        if (businessIds.size !== 1) {
            return res.status(400).json({
                success: false,
                error:
                    "Your cart contains products from different sellers. " +
                    "Please place separate orders for each seller."
            });
        }

        let total = 0;
        const orderItems = [];

        for (const product of products) {
            const quantity = quantities.get(product.id);
            const price = Number(product.price);
            const stock = Number(product.stock);

            if (
                product.is_published !== true ||
                !Number.isFinite(price) ||
                price < 0 ||
                !Number.isSafeInteger(stock) ||
                stock < quantity
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        `Sorry, "${product.name}" is unavailable ` +
                        "or does not have enough stock."
                });
            }

            const lineTotal = Math.round(
                price * quantity * 100
            ) / 100;

            total = Math.round(
                (total + lineTotal) * 100
            ) / 100;

            orderItems.push({
                product_id: product.id,
                product_name: product.name,
                quantity,
                unit_price: price,
                line_total: lineTotal
            });
        }

        if (!Number.isFinite(total) || total <= 0) {
            return res.status(400).json({
                success: false,
                error: "The order total is invalid."
            });
        }

        // Create an unpaid order. No payment is taken here.
        const { data: order, error: orderError } =
            await supabase
                .from("marketplace_orders")
                .insert({
                    customer_id: customer.id,
                    business_id: products[0].business_id,
                    status: "pending",
                    payment_status: "unpaid",
                    payment_provider: "pending",
                    total,
                    currency: "USD",
                    customer_name:
                        typeof customer_name === "string"
                            ? customer_name.trim().slice(0, 150)
                            : null,
                    customer_email: customer.email || null,
                    shipping_address:
                        typeof shipping_address === "string"
                            ? shipping_address.trim().slice(0, 500)
                            : null,
                    shipping_city:
                        typeof shipping_city === "string"
                            ? shipping_city.trim().slice(0, 100)
                            : null,
                    shipping_country:
                        typeof shipping_country === "string"
                            ? shipping_country.trim().slice(0, 100)
                            : null
                })
                .select("id,total,currency,status,payment_status")
                .single();

        if (orderError || !order) {
            console.error(
                "Marketplace order creation failed:",
                orderError
            );

            return res.status(500).json({
                success: false,
                error: "We could not create your order."
            });
        }

        // Attach the validated items to the new order.
        const { error: itemsError } = await supabase
            .from("marketplace_order_items")
            .insert(
                orderItems.map(item => ({
                    ...item,
                    order_id: order.id
                }))
            );

        if (itemsError) {
            console.error(
                "Marketplace order items creation failed:",
                itemsError
            );

            // Avoid leaving an incomplete order behind.
            const { error: rollbackError } = await supabase
                .from("marketplace_orders")
                .delete()
                .eq("id", order.id)
                .eq("customer_id", customer.id);

            if (rollbackError) {
                console.error(
                    "Marketplace order cleanup failed:",
                    rollbackError
                );
            }

            return res.status(500).json({
                success: false,
                error:
                    "We could not finish creating your order. " +
                    "Please try again."
            });
        }

        return res.status(201).json({
            success: true,
            message:
                "Your order has been created and is awaiting payment.",
            order
        });

    } catch (error) {
        console.error(
            "Unexpected marketplace checkout error:",
            error
        );

        return res.status(500).json({
            success: false,
            error: "Something went wrong. Please try again."
        });
    }
}