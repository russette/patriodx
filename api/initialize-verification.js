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

        if (!PAYSTACK_SECRET_KEY) {
            return res.status(500).json({
                status: false,
                error: "Paystack secret key is not configured on Vercel"
            });
        }

        if (
            !SUPABASE_URL ||
            !SUPABASE_SERVICE_ROLE_KEY
        ) {
            return res.status(500).json({
                status: false,
                error: "Supabase server credentials are not configured on Vercel"
            });
        }

        if (
            !MONTHLY_PLAN ||
            !YEARLY_PLAN
        ) {
            return res.status(500).json({
                status: false,
                error: "Verification Paystack plans are not configured on Vercel"
            });
        }


        // -----------------------------------------
        // AUTHENTICATION
        // -----------------------------------------

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
                error: "Invalid or expired authentication"
            });
        }


              // -----------------------------------------
        // PLAN SELECTION
        // -----------------------------------------

        const {
            plan
        } = req.body || {};

        let selectedPlan;
        let amount;


        if (plan === "monthly") {

            selectedPlan =
                MONTHLY_PLAN;

            amount =
                5809;

        } else if (plan === "yearly") {

            selectedPlan =
                YEARLY_PLAN;

            amount =
                58095;

        } else {

            return res.status(400).json({
                status: false,
                error: "Invalid verification plan"
            });
        }


        // -----------------------------------------
        // VERIFICATION DEBUG
        // -----------------------------------------

        console.log("VERIFICATION DEBUG:", {
            requestedPlan: plan,
            selectedPlan: selectedPlan,
            monthlyPlanConfigured: !!MONTHLY_PLAN,
            yearlyPlanConfigured: !!YEARLY_PLAN
        });

             // -----------------------------------------
        // VERIFY PAYSTACK PLAN
        // -----------------------------------------

        const planCheckResponse =
            await fetch(
                `https://api.paystack.co/plan/${selectedPlan}`,
                {
                    method: "GET",

                    headers: {
                        Authorization:
                            `Bearer ${PAYSTACK_SECRET_KEY}`
                    }
                }
            );

        const planCheckData =
            await planCheckResponse.json();

        console.log(
            "PAYSTACK PLAN CHECK:",
            planCheckData
        );

        if (
            !planCheckResponse.ok ||
            !planCheckData.status
        ) {
            return res.status(400).json({
                status: false,
                error:
                    planCheckData.message ||
                    "Paystack plan could not be found"
            });
        }
        // -----------------------------------------
        // PAYSTACK INITIALIZATION
        // -----------------------------------------

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

                        amount:
                            amount,

                        currency:
                            "GHS",

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
