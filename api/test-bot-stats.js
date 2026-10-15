import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            error: "Method not allowed"
        });
    }

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

    const supabaseUrl = process.env.TEST_SUPABASE_URL;
    const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
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

        const [
            botsResult,
            followsResult,
            likesResult,
            postsResult
        ] = await Promise.all([
            supabase
                .from("test_bots")
                .select("id, username, display_name")
                .order("username"),

            supabase
                .from("test_follows")
                .select("id", { count: "exact", head: true })
                .eq("following_username", "patriodx"),

            supabase
                .from("test_likes")
                .select("id", { count: "exact", head: true }),

            supabase
                .from("test_posts")
                .select("id", { count: "exact", head: true })
                .eq("owner_username", "patriodx")
        ]);

        const error =
            botsResult.error ||
            followsResult.error ||
            likesResult.error ||
            postsResult.error;

        if (error) {
            throw error;
        }

        return res.status(200).json({
            success: true,
            environment: "PATRIODX-Test",
            owner: "patriodx",
            totalBots: botsResult.data.length,
            followsRecorded: followsResult.count ?? 0,
            likesRecorded: likesResult.count ?? 0,
            ownerTestPosts: postsResult.count ?? 0,
            bots: botsResult.data
        });
    } catch (error) {
        console.error("Test statistics request failed:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to load test statistics."
        });
    }
}
