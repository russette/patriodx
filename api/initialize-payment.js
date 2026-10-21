
import { createClient } from "@supabase/supabase-js";

const ALLOWED_PLANS = {
    Pro: {
        amount: 90000,
        product: "PATRIODX Pro"
    },
    Business: {
        amount: 190000,
        product: "PATRIODX Business"
    }
};

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({
            status: false,
            error: "Method not allowed"
        });
    }

    try {
        const authorization = req.headers.authorization || "";

        if (!authorization.startsWith("Bearer ")) {
            return res.status(401).json({
                status: false,
                error: "Authentication required"
            });
        }

        const accessToken = authorization.slice(7);

        const {
            plan
        } = req.body || {};

        if (!Object.prototype.hasOwnProperty.call(ALLOWED_PLANS, plan)) {
            return res.status(400).json({
                status: false,
                error: "Invalid subscription plan"
            });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceRoleKey =
            process.env.SUPABASE_SERVICE_ROLE_KEY;
        const paystackSecretKey =
            process.env.PAYSTACK_SECRET_KEY;

        if (!supabaseUrl || !serviceRoleKey || !paystackSecretKey) {
            console.error("Payment initialization environment is incomplete.");

            return res.status(500).json({
                status: false,
                error: "Payment service is not fully configured."
            });
        }

        const supabase = createClient(
            supabaseUrl,
            serviceRoleKey,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false
                }
            }
        );

        const {
            data: userData,
            error: userError
        } = await supabase.auth.getUser(accessToken);

        const user = userData?.user;

        if (userError || !user || !user.email) {
            return res.status(401).json({
                status: false,
                error: "Your login session is invalid or expired."
            });
        }

        const {
            data: business,
            error: businessError
        } = await supabase
            .from("businesses")
            .select("id, owner_id, plan")
            .eq("owner_id", user.id)
            .maybeSingle();

        if (businessError || !business) {
            console.error(
                "Payment business lookup failed:",
                businessError
            );

            return res.status(404).json({
                status: false,
                error: "Your PATRIODX business account could not be found."
            });
        }

        const selectedPlan = ALLOWED_PLANS[plan];

        const paystackResponse = await fetch(
            "https://api.paystack.co/transaction/initialize",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paystackSecretKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: user.email,
                    amount: selectedPlan.amount,
                    currency: "GHS",
                    callback_url:
                        "https://russette.github.io/patriodx/",
                    metadata: {
                        app: "PATRIODX",
                        user_id: user.id,
                        business_id: business.id,
                        plan,
                        product: selectedPlan.product
                    }
                })
            }
        );

        const paystackResult = await paystackResponse.json();

        if (!paystackResponse.ok || !paystackResult.status) {
            console.error(
                "Paystack initialization failed:",
                paystackResult.message
            );

            return res.status(502).json({
                status: false,
                error: "Paystack could not initialize the payment."
            });
        }

        return res.status(200).json({
            status: true,
            message: "Payment initialized successfully.",
            data: {
                authorization_url:
                    paystackResult.data.authorization_url,
                access_code:
                    paystackResult.data.access_code,
                reference:
                    paystackResult.data.reference,
                amount: selectedPlan.amount,
                currency: "GHS",
                plan
            }
        });

    } catch (error) {
        console.error("Payment initialization error:", error);

        return res.status(500).json({
            status: false,
            error: "Unable to initialize payment. Please try again."
        });
    }
}

