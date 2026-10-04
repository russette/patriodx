const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const PAYSTACK_SECRET_KEY =
    process.env.PAYSTACK_SECRET_KEY;

const SUPABASE_URL =
    process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;


module.exports = async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            status: false,
            error: "Method not allowed"
        });
    }

    try {

        if (
            !PAYSTACK_SECRET_KEY ||
            !SUPABASE_URL ||
            !SUPABASE_SERVICE_ROLE_KEY
        ) {
            return res.status(500).json({
                status: false,
                error: "Server configuration error"
            });
        }


        /*
        VERIFY PAYSTACK SIGNATURE
        */

        const signature =
            req.headers["x-paystack-signature"];

        if (!signature) {
            return res.status(401).json({
                status: false,
                error: "Missing Paystack signature"
            });
        }

        const payload =
            JSON.stringify(req.body);

        const expectedSignature =
            crypto
                .createHmac(
                    "sha512",
                    PAYSTACK_SECRET_KEY
                )
                .update(payload)
                .digest("hex");

        if (
            signature !==
            expectedSignature
        ) {
            return res.status(401).json({
                status: false,
                error: "Invalid signature"
            });
        }


        /*
        SUPABASE ADMIN CLIENT
        */

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


        const event =
            req.body;


        console.log(
            "PAYSTACK VERIFICATION EVENT:",
            event.event
        );


        /*
        SUCCESSFUL PAYMENT
        */

        if (
            event.event ===
            "charge.success"
        ) {

            const payment =
                event.data || {};

            const metadata =
                payment.metadata || {};


            /*
            ONLY PROCESS PATRIODX
            VERIFICATION PAYMENTS
            */

            if (
                metadata.verification !== true
            ) {

                return res.status(200).json({
                    status: true,
                    message: "Event ignored"
                });

            }


            const userId =
                metadata.user_id;

            const verificationPlan =
                metadata.verification_plan;


            if (
                !userId ||
                !verificationPlan
            ) {

                console.error(
                    "Missing verification metadata:",
                    metadata
                );

                return res.status(400).json({
                    status: false,
                    error:
                        "Verification metadata missing"
                });

            }


            /*
            VERIFY PLAN
            */

            let expectedAmount;
            let months;

            if (
                verificationPlan ===
                "monthly"
            ) {

                expectedAmount =
                    5809;

                months = 1;

            } else if (
                verificationPlan ===
                "yearly"
            ) {

                expectedAmount =
                    58095;

                months = 12;

            } else {

                return res.status(400).json({
                    status: false,
                    error:
                        "Invalid verification plan"
                });

            }


            /*
            VERIFY PAYMENT CURRENCY
            AND AMOUNT
            */

            if (
                payment.currency !==
                "GHS"
            ) {

                console.error(
                    "Invalid verification currency:",
                    payment.currency
                );

                return res.status(400).json({
                    status: false,
                    error:
                        "Invalid verification currency"
                });

            }


            if (
                Number(payment.amount) !==
                expectedAmount
            ) {

                console.error(
                    "Invalid verification amount:",
                    {
                        received:
                            payment.amount,
                        expected:
                            expectedAmount
                    }
                );

                return res.status(400).json({
                    status: false,
                    error:
                        "Invalid verification payment amount"
                });

            }


            /*
            VERIFY USER EXISTS
            */

            const {
                data: profile,
                error: profileLookupError
            } =
                await supabaseAdmin
                    .from("profiles")
                    .select(
                        "id"
                    )
                    .eq(
                        "id",
                        userId
                    )
                    .maybeSingle();


            if (
                profileLookupError
            ) {

                console.error(
                    "PROFILE LOOKUP ERROR:",
                    profileLookupError
                );

                return res.status(500).json({
                    status: false,
                    error:
                        "Unable to verify user"
                });

            }


            if (!profile) {

                return res.status(404).json({
                    status: false,
                    error:
                        "PATRIODX profile not found"
                });

            }


            /*
            CALCULATE EXPIRATION
            */

            const startedAt =
                new Date();

            const expiresAt =
                new Date(
                    startedAt
                );

            expiresAt.setMonth(
                expiresAt.getMonth() +
                months
            );


            /*
            SAVE VERIFICATION
            SUBSCRIPTION
            */

            const {
                error:
                    subscriptionError
            } =
                await supabaseAdmin
                    .from(
                        "verification_subscriptions"
                    )
                    .upsert(
                        {

                            user_id:
                                userId,

                            email:
                                payment
                                    .customer
                                    ?.email ||
                                "",

                            plan:
                                verificationPlan,

                            amount:
                                Number(
                                    payment.amount
                                ) / 100,

                            currency:
                                "GHS",

                            provider:
                                "paystack",

                            provider_reference:
                                payment.reference,

                            status:
                                "active",

                            started_at:
                                startedAt
                                    .toISOString(),

                            expires_at:
                                expiresAt
                                    .toISOString(),

                            updated_at:
                                new Date()
                                    .toISOString()

                        },
                        {
                            onConflict:
                                "provider_reference"
                        }
                    );


            if (
                subscriptionError
            ) {

                console.error(
                    "SUBSCRIPTION SAVE ERROR:",
                    subscriptionError
                );

                return res.status(500).json({
                    status: false,
                    error:
                        "Unable to save verification subscription"
                });

            }


            /*
            ACTIVATE BLUE CHECK
            */

            const {
                error:
                    profileUpdateError
            } =
                await supabaseAdmin
                    .from(
                        "profiles"
                    )
                    .update(
                        {

                            is_verified:
                                true,

                            verification_plan:
                                verificationPlan,

                            verification_expires_at:
                                expiresAt
                                    .toISOString(),

                            updated_at:
                                new Date()
                                    .toISOString()

                        }
                    )
                    .eq(
                        "id",
                        userId
                    );


            if (
                profileUpdateError
            ) {

                console.error(
                    "PROFILE UPDATE ERROR:",
                    profileUpdateError
                );

                return res.status(500).json({
                    status: false,
                    error:
                        "Unable to activate verification"
                });

            }


            console.log(
                "BLUE CHECK ACTIVATED:",
                {
                    userId,
                    plan:
                        verificationPlan,
                    reference:
                        payment.reference
                }
            );

        }


        /*
        SUBSCRIPTION CREATED
        */

        if (
            event.event ===
            "subscription.create"
        ) {

            const subscription =
                event.data || {};

            const subscriptionCode =
                subscription
                    .subscription_code;

            const customerCode =
                subscription
                    .customer
                    ?.customer_code;

            const email =
                subscription
                    .customer
                    ?.email;


            if (
                subscriptionCode &&
                email
            ) {

                const {
                    data:
                        verificationSubscription,
                    error:
                        lookupError
                } =
                    await supabaseAdmin
                        .from(
                            "verification_subscriptions"
                        )
                        .select(
                            "id"
                        )
                        .eq(
                            "email",
                            email
                        )
                        .eq(
                            "status",
                            "active"
                        )
                        .order(
                            "created_at",
                            {
                                ascending:
                                    false
                            }
                        )
                        .limit(1)
                        .maybeSingle();


                if (
                    lookupError
                ) {

                    console.error(
                        "SUBSCRIPTION LOOKUP ERROR:",
                        lookupError
                    );

                } else if (
                    verificationSubscription
                ) {

                    const {
                        error:
                            updateError
                    } =
                        await supabaseAdmin
                            .from(
                                "verification_subscriptions"
                            )
                            .update(
                                {

                                    subscription_code:
                                        subscriptionCode,

                                    customer_code:
                                        customerCode ||
                                        null,

                                    updated_at:
                                        new Date()
                                            .toISOString()

                                }
                            )
                            .eq(
                                "id",
                                verificationSubscription.id
                            );


                    if (
                        updateError
                    ) {

                        console.error(
                            "SUBSCRIPTION LINK ERROR:",
                            updateError
                        );

                    }

                }

            }

        }


        /*
        SUBSCRIPTION DISABLED
        */

        if (
            event.event ===
            "subscription.disable"
        ) {

            const subscription =
                event.data || {};

            const subscriptionCode =
                subscription
                    .subscription_code;


            if (
                subscriptionCode
            ) {

                const {
                    data:
                        verificationSubscription,
                    error:
                        lookupError
                } =
                    await supabaseAdmin
                        .from(
                            "verification_subscriptions"
                        )
                        .select(
                            "user_id"
                        )
                        .eq(
                            "subscription_code",
                            subscriptionCode
                        )
                        .maybeSingle();


                if (
                    lookupError
                ) {

                    console.error(
                        "DISABLE LOOKUP ERROR:",
                        lookupError
                    );

                } else if (
                    verificationSubscription
                ) {

                    await supabaseAdmin
                        .from(
                            "verification_subscriptions"
                        )
                        .update(
                            {

                                status:
                                    "disabled",

                                updated_at:
                                    new Date()
                                        .toISOString()

                            }
                        )
                        .eq(
                            "subscription_code",
                            subscriptionCode
                        );


                    await supabaseAdmin
                        .from(
                            "profiles"
                        )
                        .update(
                            {

                                is_verified:
                                    false,

                                verification_plan:
                                    null,

                                verification_expires_at:
                                    null,

                                updated_at:
                                    new Date()
                                        .toISOString()

                            }
                        )
                        .eq(
                            "id",
                            verificationSubscription.user_id
                        );

                }

            }

        }


        return res.status(200).json({
            status: true,
            message:
                "Webhook processed"
        });


    } catch (error) {

        console.error(
            "PAYSTACK VERIFICATION WEBHOOK ERROR:",
            error
        );

        return res.status(500).json({
            status: false,
            error:
                "Webhook processing failed"
        });

    }

};
