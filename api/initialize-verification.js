const { createClient } = require("@supabase/supabase-js");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

const MONTHLY_PLAN =
    process.env.PAYSTACK_VERIFIED_MONTHLY_PLAN;

const YEARLY_PLAN =
    process.env.PAYSTACK_VERIFIED_YEARLY_PLAN;

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            status: false,
            error: "Method not allowed"
        });
    }

    try {
        if (!PAYSTACK_SECRET_KEY) {
            return res.status(500).json({
                status: false,
                error: "Paystack secret key is not configured on Vercel"
            });
        }

        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
            return res.status(500).json({
                status: false,
                error: "Supabase authentication is not configured on Vercel"
            });
        }

        if (!MONTHLY_PLAN || !YEARLY_PLAN) {
            return res.status(500).json({
                status: false,
                error: "Verification Paystack plans are not configured on Vercel"
            });
        }

        // ---------------------------------------------------------
        // AUTHENTICATE THE USER
        // ---------------------------------------------------------

        const authorization =
            req.headers.authorization ||
            req.headers.Authorization;

        if (!authorization ||
            !authorization.startsWith("Bearer ")) {
            return res.status(401).json({
                status: false,
                error: "Authentication required"
            });
        }

        const accessToken =
            authorization.replace("Bearer ", "").trim();

        const supabaseAuth = createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        const {
            data: { user },
            error: userError
        } = await supabaseAuth.auth.getUser(accessToken);

        if (userError || !user) {
            console.error(
                "SUPABASE AUTH ERROR:",
                userError
            );

            return res.status(401).json({
                status: false,
                error: "Invalid or expired authentication"
            });
        }

        // ---------------------------------------------------------
        // GET REQUESTED PLAN
        // ---------------------------------------------------------

        const { plan } = req.body || {};

        if (plan !== "monthly" && plan !== "yearly") {
            return res.status(400).json({
                status: false,
                error: "Invalid verification plan"
            });
        }

        const selectedPlan =
            plan === "monthly"
                ? MONTHLY_PLAN
                : YEARLY_PLAN;

        // ---------------------------------------------------------
        // INITIALIZE PAYSTACK SUBSCRIPTION
        // ---------------------------------------------------------

        const response = await fetch(
            "https://api.paystack.co/transaction/initialize",
            {
                method: "POST",
                headers: {
                    Authorization:
                        `Bearer ${PAYSTACK_SECRET_KEY}`,
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    email: user.email,
                    plan: selectedPlan,
                    metadata: {
                        verification: true,
                        user_id: user.id,
                        verification_plan: plan
                    }
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.status) {
            console.error(
                "PAYSTACK VERIFICATION INITIALIZATION ERROR:",
                data
            );

            return res.status(400).json({
                status: false,
                error:
                    data.message ||
                    "Unable to initialize verification payment"
            });
        }

        return res.status(200).json({
            status: true,
            authorization_url:
                data.data.authorization_url,
            access_code:
                data.data.access_code,
            reference:
                data.data.reference
        });

    } catch (error) {
        console.error(
            "VERIFICATION PAYMENT INITIALIZATION ERROR:",
            error
        );

        return res.status(500).json({
            status: false,
            error: "Unable to initialize verification payment"
        });
    }
};
