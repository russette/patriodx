import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    // Allow only GET and POST requests.
    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

    // Require a private server-side secret.
    const expectedSecret = process.env.TEST_BOTS_CRON_SECRET;
    const authorization = req.headers.authorization || "";

    if (
        !expectedSecret ||
        authorization !== `Bearer ${expectedSecret}`
    ) {
        return res.status(401).json({
            success: false,
            error: "Unauthorized"
        });
    }

    // Connect exclusively to the separate test project.
    const supabaseUrl = process.env.TEST_SUPABASE_URL;
    const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        console.error("Test Supabase credentials are missing.");

        return res.status(500).json({
            success: false,
            error: "Test environment is not configured."
        });
    }

    try {
        const supabase = createClient(
            supabaseUrl,
            serviceKey,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false
                }
            }
        );

        // Load the test bots.
        const {
            data: bots,
            error: botsError
        } = await supabase
            .from("test_bots")
            .select("id, username")
            .order("username");

        if (botsError) throw botsError;

        if (!bots || bots.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No test bots found.",
                bots: 0,
                followsRecorded: 0,
                likesRecorded: 0
            });
        }

        // Find posts belonging to the test owner.
        const {
            data: posts,
            error: postsError
        } = await supabase
            .from("test_posts")
            .select("id")
            .eq("owner_username", "patriodx");

        if (postsError) throw postsError;

        // Record each bot following the test owner.
        const followRows = bots.map(bot => ({
            follower_bot_id: bot.id,
            following_username: "patriodx"
        }));

        const {
            error: followsError
        } = await supabase
            .from("test_follows")
            .upsert(followRows, {
                onConflict: "follower_bot_id,following_username",
                ignoreDuplicates: true
            });

        if (followsError) throw followsError;

        // Record likes on the owner's test posts only.
        let likesRecorded = 0;

        if (posts && posts.length > 0) {
            const likeRows = bots.flatMap(bot =>
                posts.map(post => ({
                    bot_id: bot.id,
                    post_id: post.id
                }))
            );

            const {
                data: insertedLikes,
                error: likesError
            } = await supabase
                .from("test_likes")
                .upsert(likeRows, {
                    onConflict: "bot_id,post_id",
                    ignoreDuplicates: true
                })
                .select("id");

            if (likesError) throw likesError;

            likesRecorded = insertedLikes?.length ?? 0;
        }

        return res.status(200).json({
            success: true,
            message: "Test bot run completed.",
            bots: bots.length,
            owner: "patriodx",
            ownerPostsFound: posts?.length ?? 0,
            followsProcessed: bots.length,
            newLikesRecorded: likesRecorded
        });

    } catch (error) {
        console.error("Test bot run failed:", error);

        return res.status(500).json({
            success: false,
            error: "The test bot run failed. Check server logs."
        });
    }
}
