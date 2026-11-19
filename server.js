const express = require('express');
const path = require('path');
const { getUser, updateUser } = require('./firebase.js');
require('./index.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Render Health Check Endpoint (বট স্লিপ মোডে যাওয়া আটকাতে)
app.get('/health', (req, res) => res.status(200).send('Kimo Bot is Alive!'));

app.post('/api/admin', async (req, res) => {
    const { password, action, targetId, value } = req.body;

    if (password !== (process.env.ADMIN_PASSWORD || 'kimo1234')) {
        return res.status(401).json({ success: false, error: 'Invalid Admin Password!' });
    }

    try {
        let userData = await getUser(targetId);

        switch (action) {
            case 'seecash':
                return res.json({
                    success: true,
                    message: `<b>ID:</b> ${targetId} | <b>Unique ID:</b> #${userData.uniqueID}<br>
                              <b>Balance:</b> ${userData.Money.toLocaleString()} KIM<br>
                              <b>Level:</b> ${userData.level || 1} (${userData.XP.toLocaleString()} XP)<br>
                              <b>Rank:</b> ${userData.rank} | <b>Badges:</b> ${userData.Badges || 'None'}<br>
                              <b>Status:</b> ${userData.isBanned ? '🚫 BANNED (' + userData.banReason + ')' : '✅ Active'}`
                });
            case 'moneyadd':
                const amt = parseInt(value);
                if (isNaN(amt)) return res.json({ success: false, error: 'Enter a valid number.' });
                userData.Money = Math.max(0, userData.Money + amt);
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `Updated Balance: <b>${userData.Money.toLocaleString()} KIM</b>` });
            case 'addxp':
                const xp = parseInt(value);
                if (isNaN(xp)) return res.json({ success: false, error: 'Enter a valid XP number.' });
                userData.XP += xp;
                userData.level = Math.floor(0.1 * Math.sqrt(userData.XP)) + 1;
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `Added ${xp} XP. User is now <b>Level ${userData.level}</b>.` });
            case 'setrank':
                if (!value) return res.json({ success: false, error: 'Rank cannot be empty.' });
                userData.rank = value;
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `Rank updated to <b>${value}</b>.` });
            case 'addbadge':
                if (!value) return res.json({ success: false, error: 'Provide an emoji.' });
                userData.Badges = `${userData.Badges || ''} ${value}`.trim();
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `Badge ${value} added!` });
            case 'botban':
                userData.isBanned = true;
                userData.banReason = value || 'Violation of Kimo Rules';
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `User <b>${targetId}</b> has been Bot Banned.` });
            case 'botunban':
                userData.isBanned = false;
                userData.banReason = 'None';
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `User <b>${targetId}</b> has been Unbanned.` });
            case 'reset':
                userData.Money = 0;
                userData.XP = 0;
                userData.level = 1;
                await updateUser(targetId, userData);
                return res.json({ success: true, message: `User <b>${targetId}</b> economy & XP reset to 0.` });
            default:
                return res.json({ success: false, error: 'Unknown action.' });
        }
    } catch (err) {
        return res.json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`[WEB SERVER] Kimo Dashboard active on port ${PORT}`);
});
