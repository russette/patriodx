import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

    // =========================================================
    // CORS
    // =========================================================

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "POST, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );


    // =========================================================
    // OPTIONS
    // =========================================================

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }


    // =========================================================
    // POST ONLY
    // =========================================================

    if (req.method !== "POST") {

        return res.status(405).json({
            status: false,
            error: "Method not allowed"
        });
    }


    try {

        // =====================================================
        // GET REQUEST DATA
        // =====================================================

        const {
            reference,
            plan
        } = req.body || {};


        if (!reference) {

            return res.status(400).json({
                status: false,
                error: "Payment reference is required"
            });
        }


        // =====================================================
        // VALIDATE PLAN
        // =====================================================

        if (
            plan !== "Pro" &&
            plan !== "Business"
        ) {

            return res.status(400).json({
                status: false,
                error: "Invalid plan"
            });
        }


        // =====================================================
        // ENVIRONMENT VARIABLES
        // =====================================================

        const secretKey =
            process.env.PAYSTACK_SECRET_KEY;

        const supabaseUrl =
            process.env.SUPABASE_URL;

        const supabaseServiceKey =
            process.env.SUPABASE_SERVICE_ROLE_KEY;


        if (!secretKey) {

            console.error(
                "PAYSTACK_SECRET_KEY is missing"
            );

            return res.status(500).json({
                status: false,
                error:
                    "PAYSTACK_SECRET_KEY is not configured on Vercel"
            });
        }


        if (!supabaseUrl || !supabaseServiceKey) {

            console.error(
                "Supabase server credentials are missing"
            );

            return res.status(500).json({
                status: false,
                error:
                    "Supabase server credentials are not configured on Vercel"
            });
        }


        // =====================================================
        // GET USER ACCESS TOKEN
        // =====================================================

        const authorization =
            req.headers.authorization || "";

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
            authorization.substring(7);


        // =====================================================
        // SUPABASE SERVER CLIENT
        // =====================================================

        const supabase =
            createClient(
                supabaseUrl,
                supabaseServiceKey
            );


        // =====================================================
        // VERIFY SUPABASE USER
        // =====================================================

        const {
            data: userData,
            error: userError
        } = await supabase.auth.getUser(
            accessToken
        );


        if (
            userError ||
            !userData?.user
        ) {

            console.error(
                "Supabase authentication error:",
                userError
            );

            return res.status(401).json({
                status: false,
                error: "Invalid or expired login session"
            });
        }


        const user =
            userData.user;


        // =====================================================
        // FIND USER'S BUSINESS
        // =====================================================

        const {
            data: business,
            error: businessError
        } = await supabase
            .from("businesses")
            .select("*")
            .eq(
                "owner_id",
                user.id
            )
            .single();


        if (businessError || !business) {

            console.error(
                "Business lookup error:",
                businessError
            );

            return res.status(404).json({
                status: false,
                error:
                    "Your PATRIODX business account could not be found"
            });
        }


        // =====================================================
        // VERIFY PAYMENT WITH PAYSTACK
        // =====================================================

        const paystackResponse =
            await fetch(
                `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
                {
                    method: "GET",

                    headers: {
                        Authorization:
                            `Bearer ${secretKey}`,

                        "Content-Type":
                            "application/json"
                    }
                }
            );


        const paystackResult =
            await paystackResponse.json();


        console.log(
            "Paystack verification:",
            {
                httpStatus:
                    paystackResponse.status,

                status:
                    paystackResult.status,

                message:
                    paystackResult.message,

                reference
            }
        );


        // =====================================================
        // PAYSTACK API ERROR
        // =====================================================

        if (
            !paystackResponse.ok ||
            !paystackResult.status
        ) {

            return res.status(
                paystackResponse.status || 400
            ).json({

                status: false,

                error:
                    paystackResult.message ||
                    "Unable to verify payment"

            });
        }


        // =====================================================
        // VERIFIED TRANSACTION
        // =====================================================

        const payment =
            paystackResult.data;


        if (!payment) {

            return res.status(400).json({
                status: false,
                error:
                    "Paystack returned no transaction data"
            });
        }


        // =====================================================
        // PAYMENT MUST BE SUCCESSFUL
        // =====================================================

        if (payment.status !== "success") {

            return res.status(400).json({

                status: false,

                error:
                    `Payment has not been completed. Paystack status: ${payment.status}`,

                data: {
                    reference:
                        payment.reference,

                    status:
                        payment.status
                }

            });
        }


        // =====================================================
        // CUSTOMER EMAIL
        // =====================================================

        const paymentEmail =
            payment.customer?.email ||
            payment.email ||
            "";


        // =====================================================
        // MAKE SURE PAYMENT BELONGS TO LOGGED-IN USER
        // =====================================================

        if (
            paymentEmail &&
            user.email &&
            paymentEmail.toLowerCase() !==
            user.email.toLowerCase()
        ) {

            return res.status(403).json({

                status: false,

                error:
                    "This payment does not belong to the logged-in account"

            });
        }


        // =====================================================
        // VERIFY AMOUNT AND CURRENCY
        // =====================================================

        const expectedAmount =
            plan === "Pro"
                ? 90000
                : 190000;

        const expectedCurrency =
            "GHS";


        if (
            Number(payment.amount) !==
            expectedAmount
        ) {

            console.error(
                "Incorrect payment amount:",
                {
                    expected:
                        expectedAmount,

                    received:
                        payment.amount,

                    reference
                }
            );

            return res.status(400).json({

                status: false,

                error:
                    "Payment amount does not match the selected plan"

            });
        }


        if (
            String(payment.currency).toUpperCase() !==
            expectedCurrency
        ) {

            console.error(
                "Incorrect payment currency:",
                {
                    expected:
                        expectedCurrency,

                    received:
                        payment.currency,

                    reference
                }
            );

            return res.status(400).json({

                status: false,

                error:
                    "Payment currency does not match the selected plan"

            });
        }


        // =====================================================
        // PAYMENT REFERENCE
        // =====================================================

        const providerReference =
            payment.reference;


        // =====================================================
        // CHECK FOR EXISTING SUBSCRIPTION
        // =====================================================

        const {
            data: existingSubscription,
            error: existingError
        } = await supabase
            .from("subscriptions")
            .select("*")
            .eq(
                "provider_reference",
                providerReference
            )
            .maybeSingle();


        if (existingError) {

            console.error(
                "Subscription lookup error:",
                existingError
            );

            return res.status(500).json({

                status: false,

                error:
                    "Unable to check existing subscription"

            });
        }


        // =====================================================
        // PREVENT DOUBLE ACTIVATION
        // =====================================================

        if (existingSubscription) {

            return res.status(200).json({

                status: true,

                message:
                    "Payment was already verified",

                data: {

                    reference:
                        existingSubscription.provider_reference,

                    email:
                        existingSubscription.email,

                    plan:
                        existingSubscription.plan,

                    status:
                        existingSubscription.status,

                    amount:
                        existingSubscription.amount,

                    currency:
                        existingSubscription.currency,

                    expires_at:
                        existingSubscription.expires_at

                }

            });
        }


        // =====================================================
        // SUBSCRIPTION DATES
        // =====================================================

        const startedAt =
            new Date();

        const expiresAt =
            new Date(startedAt);


        // 30-day subscription

        expiresAt.setDate(
            expiresAt.getDate() + 30
        );


        // =====================================================
        // SAVE SUBSCRIPTION
        // =====================================================

        const {
            data: subscription,
            error: insertError
        } = await supabase
            .from("subscriptions")
            .insert({

                email:
                    paymentEmail ||
                    user.email,

                plan:
                    plan,

                status:
                    "active",

                provider:
                    "paystack",

                provider_reference:
                    providerReference,

                amount:
                    Number(payment.amount) / 100,

                currency:
                    payment.currency,

                started_at:
                    startedAt.toISOString(),

                expires_at:
                    expiresAt.toISOString()

            })
            .select()
            .single();


        if (insertError) {

            console.error(
                "Subscription insert error:",
                insertError
            );

            return res.status(500).json({

                status: false,

                error:
                    "Payment was verified, but the subscription could not be saved",

                details:
                    insertError.message

            });
        }


        // =====================================================
        // UPDATE BUSINESS PLAN
        // =====================================================

        const {
            data: updatedBusiness,
            error: updateError
        } = await supabase
            .from("businesses")
            .update({

                plan:
                    plan.toLowerCase()

            })
            .eq(
                "id",
                business.id
            )
            .eq(
                "owner_id",
                user.id
            )
            .select()
            .single();


        // =====================================================
        // BUSINESS UPDATE ERROR
        // =====================================================

        if (updateError) {

            console.error(
                "Business plan update error:",
                updateError
            );

            return res.status(500).json({

                status: false,

                error:
                    "Payment was verified and subscription saved, but your business plan could not be updated",

                details:
                    updateError.message

            });
        }


        // =====================================================
        // SUCCESS
        // =====================================================

        console.log(
            "PATRIODX plan activated:",
            {
                userId:
                    user.id,

                businessId:
                    updatedBusiness.id,

                plan:
                    updatedBusiness.plan,

                reference:
                    providerReference
            }
        );


        return res.status(200).json({

            status: true,

            message:
                "Payment verified and subscription activated",

            data: {

                id:
                    subscription.id,

                reference:
                    subscription.provider_reference,

                email:
                    subscription.email,

                plan:
                    subscription.plan,

                status:
                    subscription.status,

                amount:
                    subscription.amount,

                currency:
                    subscription.currency,

                started_at:
                    subscription.started_at,

                expires_at:
                    subscription.expires_at

            }

        });


    } catch (error) {

        console.error(
            "Payment verification error:",
            error
        );


        return res.status(500).json({

            status: false,

            error:
                error.message ||
                "Server error while verifying payment"

        });
    }
}
