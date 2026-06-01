const { MongoClient } = require('mongodb');

async function main() {
    const uri = "mongodb://localhost:27017";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db('lead-automation');
        const posts = database.collection('socialposts');
        
        // Find the most recent posts
        const recentPosts = await posts.find({}).sort({createdAt: -1}).limit(5).toArray();
        console.log(JSON.stringify(recentPosts, null, 2));
    } finally {
        await client.close();
    }
}
main().catch(console.dir);
