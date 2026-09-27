const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const MONTHLY_PLAN = process.env.PAYSTACK_VERIFIED_MONTHLY_PLAN;
const YEARLY_PLAN = process.env.PAYSTACK_VERIFIED_YEARLY_PLAN;

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

        if (!MONTHLY_PLAN || !YEARLY_PLAN) {
            return res.status(500).json({
                status: false,
                error: "Verification Paystack plans are not configured on Vercel"
            });
        }

        const {
            email,
            plan,
            user_id
        } = req.body || {};

        if (!email || !user_id || !plan) {
            return res.status(400).json({
                status: false,
                error: "Email, user ID and verification plan are required"
            });
        }

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

        const response = await fetch(
            "https://api.paystack.co/transaction/initialize",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    plan: selectedPlan,
                    metadata: {
                        verification: true,
                        user_id
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
            authorization_url: data.data.authorization_url,
            access_code: data.data.access_code,
            reference: data.data.reference
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
