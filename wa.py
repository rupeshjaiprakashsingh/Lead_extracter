import urllib.parse
businesses = [
    {
        'name': 'F A INFOTECH',
        'phone': '919026329200',
        'message': '''Namaste Sir! 🙏\n\nAapka *F A INFOTECH* Sangam Tower, Naza Market pe Google Maps pe dekha — *4.9 stars with 175 reviews* — bahut zabardast reputation hai aapki! 🏆\n\nLekin ek *urgent problem* notice ki jo roz aapka *direct loss* kar rahi hai:\n\n⚠️ *Google Maps pe aapki koi website nahi hai!*\n\nJab koi customer *"refurbished laptop Hazratganj"* Google pe search karta hai:\n❌ Aap search results mein nahi dikhte\n❌ Koi product page nahi — customer competitors ke paas chala jaata hai\n❌ *175 happy customers hain par zero online presence*\n\nAapke same building mein competitors hain jo website aur Google Ads chal rahe hain — woh aapke customers le ja rahe hain daily!\n\nMain aapke liye:\n✅ *Professional Website* banaunga\n✅ *Google Ads* setup — "laptop Hazratganj" pe top mein aao\n✅ *WhatsApp Business* button for instant leads\n✅ *Google Business Profile* fully optimize karunga\n\n*FREE 10-minute call mein poora plan share karunga.* 🚀🙏'''
    },
    {
        'name': 'RPM Technologies',
        'phone': '918318654441',
        'message': '''Namaste Sir! 🙏\n\nAapka *RPM Technologies* Vikas Nagar pe Google Maps pe dekha — *4.6 stars* — achha start hai! 👍\n\nLekin main honestly bolunga — aap abhi *bahut badi growth miss kar rahe ho:*\n\n🔴 *Koi website nahi hai* — online customers aapko dhundh hi nahi sakte\n🔴 *Sirf 10 reviews* — naye customers trust nahi karte kam reviews wali shop\n🔴 *Competitors ke 200-500+ reviews hain* — woh pehle dikhte hain, aap nahi\n\n*Good news:* Aap abhi bilkul sahi time pe hain — *shuru mein digital marketing karo toh fast growth hoti hai!*\n\nMain aapke liye:\n✅ *Professional Website* — products, pricing, WhatsApp button\n✅ *Google Review Campaign* — 10 se 100+ reviews 60 din mein\n✅ *Google Ads* — Vikas Nagar aur surrounding area ke buyers target karo\n✅ *Social Media Setup* — Instagram & Facebook presence\n\n*Kya ek FREE 10-min call ho ho sakti hai?* Main growth plan share karunga. 🚀🙏'''
    },
    {
        'name': 'Jaisdon Tech Solution',
        'phone': '917007360189',
        'message': '''Namaste Sir! 🙏\n\nAapka *Jaisdon Tech Solution* Google Maps pe dekha — *4.6 stars with 259 reviews* — Lucknow mein ek *established naam* ban chuke ho aap! 👏\n\nLekin ek *shocking observation* share karna tha:\n\n⚠️ *Aapki website WhatsApp.com listed hai — koi real business website hi nahi!*\n\nIska matlab:\n❌ Google pe *"computer wholesaler Lucknow"* search karne wale customers aapko find nahi kar paate\n❌ *259 reviews ki reputation* online sales mein convert nahi ho rahi\n❌ Bulk order buyers — schools, offices, colleges — aapko online dhundh ke competitor ke paas ja rahe hain\n\n*Aap Computer Wholesaler hain* — iska matlab *B2B clients* (offices, institutes) bhi target kar sakte hain Digital Marketing se. Yeh ek *huge untapped opportunity* hai!\n\nMain aapke liye:\n✅ *Professional Website* with bulk order enquiry form\n✅ *Google Ads* — "laptop wholesaler Lucknow" pe top rank\n✅ *B2B Landing Page* — corporate clients ke liye\n✅ *WhatsApp Business* — proper business setup\n\n*FREE 15-minute call mein poora roadmap share karunga.* 📞🙏'''
    },
    {
        'name': 'MeraLaptop Tech Solutions',
        'phone': '919918462222',
        'message': '''Namaste Sir! 🙏\n\nAapka *MeraLaptop Tech Solutions* Google Maps pe dekha — *4.8 stars with 38 reviews* aur website bhi hai meralaptop.in — great foundation hai! 👏\n\nLekin main aapko ek important opportunity batana chahta hun jo *aap miss kar rahe ho:*\n\n🔴 *Koi Google Ads campaign nahi* — Rajajipuram aur surrounding area mein "laptop" search karne wale customers competitors ke paas ja rahe hain\n🔴 *No dedicated Landing Pages* — ad clicks homepage pe bounce karte hain, sale nahi hoti\n🔴 *38 reviews* — aapki 4.8 rating excellent hai par competitors ke *200-500 reviews hain* — woh pehle trust karte hain\n🔴 *Social Media weak* — *meralaptop* brand bahut catchy naam hai, Instagram pe viral ho sakta hai!\n\n*Aapka brand naam "MeraLaptop" ekdam perfect marketing naam hai!* Isko sahi tarike se market karo toh Lucknow ka *top recall brand* ban sakta hai.\n\nMain aapke liye:\n✅ *Google Ads* — "laptop Rajajipuram" + "laptop Lucknow" pe top mein aao\n✅ *High-Converting Landing Page* — website pe traffic ko sales mein convert karo\n✅ *Instagram & Reels Strategy* — MeraLaptop brand viral karo\n✅ *Review Generation Campaign* — 38 se 200+ reviews fast\n\n*Kya FREE 15-min audit call ho sakti hai?* 🚀🙏'''
    },
    {
        'name': 'Laptop House',
        'phone': '919984999994',
        'message': '''Namaste Sir! 🙏\n\nAapka *Laptop House* Naza Market, Sangam Tower pe Google Maps pe dekha — *4.2 stars with 579 reviews!* 🏆 Itne reviews Lucknow mein bahut kum logon ke paas hain — aap clearly ek *bahut purana aur trusted store* ho!\n\nLekin ek *badi problem* share karna chahta hun:\n\n⚠️ *Aapki "website" sirf ek WhatsApp link (wa.me) hai — koi real website nahi!*\n\n579 reviews ke saath bhi:\n❌ Google pe *"laptop repair Hazratganj"* search karne wale customers aapko nahi dhundhte\n❌ *Koi online product/service page nahi* — customer directly buy ya enquiry nahi kar sakta\n❌ Naye competitors jo website aur ads run kar rahe hain *aapke loyal customers ko attract kar rahe hain*\n\n*579 reviews = Lucknow ke sabse experienced aur trusted stores mein se ek.*\n*0 real website = Bahut bada daily online loss.*\n\nYeh gap *immediately fix* honi chahiye. Main aapke liye:\n✅ *Professional Website* — services, products, pricing clearly listed\n✅ *Google Ads* — repair + sales dono ke liye local targeting\n✅ *Landing Page* — "Laptop Repair Lucknow" searches se direct leads\n✅ *Google Business Profile* — 579 reviews ko properly showcase karo\n✅ *WhatsApp Business* — proper catalogue aur quick reply setup\n\n*Aapki reputation already top-class hai — bas digital presence match karni hai.*\n\n*FREE 10-minute call mein plan share karunga.* 📞🙏'''
    }
]

for b in businesses:
    encoded_msg = urllib.parse.quote(b['message'])
    url = f"https://web.whatsapp.com/send?phone={b['phone']}&text={encoded_msg}"
    print(f"### {b['name']}")
    print(f"[👉 Click Here to message {b['name']} on WhatsApp Web]({url})")
    print()
