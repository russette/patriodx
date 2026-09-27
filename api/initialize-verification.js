const { createClient } = require("@supabase/supabase-js");

const PAYSTACK_SECRET_KEY =
    process.env.PAYSTACK_SECRET_KEY;

const SUPABASE_URL =
    process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

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

        // -------------------------------------------------
        // CHECK SERVER CONFIGURATION
        // -------------------------------------------------

        if (!PAYSTACK_SECRET_KEY) {
            return res.status(500).json({
                status: false,
                error:
                    "Paystack secret key is not configured on Vercel"
            });
        }

        if (
            !SUPABASE_URL ||
            !SUPABASE_SERVICE_ROLE_KEY
        ) {
            return res.status(500).json({
                status: false,
                error:
                    "Supabase server credentials are not configured on Vercel"
            });
        }

        if (
            !MONTHLY_PLAN ||
            !YEARLY_PLAN
        ) {
            return res.status(500).json({
                status: false,
                error:
                    "Verification Paystack plans are not configured on Vercel"
            });
        }


        // -------------------------------------------------
        // GET USER ACCESS TOKEN
        // -------------------------------------------------

        const authorization =
            req.headers.authorization ||
            req.headers.Authorization;

        if (
            !authorization ||
            !authorization.startsWith("Bearer ")
        ) {
            return res.status(401).json({
                status: false,
                error: "Authentication required"
            });
        }

        const accessToken =
            authorization
                .replace("Bearer ", "")
                .trim();


        if (!accessToken) {
            return res.status(401).json({
                status: false,
                error: "Authentication token is missing"
            });
        }


        // -------------------------------------------------
        // SERVER-SIDE SUPABASE CLIENT
        // -------------------------------------------------

        const supabaseAdmin =
            createClient(
                SUPABASE_URL,
                SUPABASE_SERVICE_ROLE_KEY,
                {
                    auth: {
                        autoRefreshToken: false,
                        persistSession: false
                    }
                }
            );


        // -------------------------------------------------
        // VERIFY USER TOKEN
        // -------------------------------------------------

        const {
            data: {
                user
            },
            error: userError
        } =
            await supabaseAdmin.auth.getUser(
                accessToken
            );


        if (
            userError ||
            !user
        ) {

            console.error(
                "SUPABASE AUTH ERROR:",
                userError
            );

            return res.status(401).json({
                status: false,
                error:
                    "Invalid or expired authentication"
            });
        }


        // -------------------------------------------------
        // GET REQUESTED VERIFICATION PLAN
        // -------------------------------------------------

        const {
            plan
        } = req.body || {};


        if (
            plan !== "monthly" &&
            plan !== "yearly"
        ) {
            return res.status(400).json({
                status: false,
                error:
                    "Invalid verification plan"
            });
        }


        const selectedPlan =
            plan === "monthly"
                ? MONTHLY_PLAN
                : YEARLY_PLAN;


        // -------------------------------------------------
        // INITIALIZE PAYSTACK RECURRING PAYMENT
        // -------------------------------------------------

        const response =
            await fetch(
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

                        email:
                            user.email,

                        plan:
                            selectedPlan,

                        metadata: {

                            verification:
                                true,

                            user_id:
                                user.id,

                            verification_plan:
                                plan

                        }

                    })
                }
            );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.status
        ) {

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


        // -------------------------------------------------
        // RETURN PAYSTACK CHECKOUT
        // -------------------------------------------------

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
            error:
                "Unable to initialize verification payment"
        });
    }
};
