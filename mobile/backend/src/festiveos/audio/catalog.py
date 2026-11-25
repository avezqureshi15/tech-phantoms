"""A curated list of devotional and festival music, by festival.

No audio is hosted or bundled: each entry carries search links that open in the person's own
streaming app, so there is no licensing to manage. Entries are well-known works only. A performer
is named only where one recording is so closely tied to the piece that it makes the search better;
otherwise the search finds the many versions and the listener chooses.

The order within a festival is an editorial choice (most familiar first), not a measured ranking.
Adding a track is one line below. A new entry's festival codes must be real ``FestivalType``
values (a test enforces it).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Track:
    id: str
    title: str
    kind: (
        str  # aarti | bhajan | stotra | mantra | chant | hymn | carol | recitation | naat | kirtan
    )
    faith: str
    theme: str  # the deity, saint or occasion it is for
    language: str
    note: str
    festivals: tuple[str, ...]
    performer: str | None = None


def _t(id, title, kind, faith, theme, language, note, festivals, performer=None) -> Track:
    return Track(id, title, kind, faith, theme, language, note, tuple(festivals), performer)


TRACKS: tuple[Track, ...] = (
    # ---------------------------------------------------------------------------------- Hindu
    _t("lakshmi-aarti", "Om Jai Lakshmi Mata", "aarti", "hindu", "Lakshmi", "Hindi", "The evening aarti sung at Lakshmi Puja", ["DIWALI", "AKSHAYA_TRITIYA"]),
    _t("shri-suktam", "Shri Suktam", "stotra", "hindu", "Lakshmi", "Sanskrit", "Vedic hymn to Lakshmi, chanted at Diwali", ["DIWALI", "AKSHAYA_TRITIYA"]),
    _t("jagdish-aarti", "Om Jai Jagdish Hare", "aarti", "hindu", "Vishnu", "Hindi", "The best-known household aarti", ["DIWALI", "JANMASHTAMI"]),
    _t("ganesh-aarti", "Jai Ganesh Deva", "aarti", "hindu", "Ganesha", "Hindi", "Ganesha's aarti", ["GANESH_CHATURTHI", "DIWALI"]),
    _t("sukhkarta", "Sukhkarta Dukhharta", "aarti", "hindu", "Ganesha", "Marathi", "Samarth Ramdas's aarti, the heart of Ganeshotsav", ["GANESH_CHATURTHI"]),
    _t("vakratunda", "Vakratunda Mahakaya", "mantra", "hindu", "Ganesha", "Sanskrit", "The shloka that begins every auspicious task", ["GANESH_CHATURTHI", "DIWALI"]),
    _t("atharvashirsha", "Ganapati Atharvashirsha", "stotra", "hindu", "Ganesha", "Sanskrit", "Chanted in batches at Ganesh Chaturthi", ["GANESH_CHATURTHI"]),
    _t("hanuman-chalisa", "Hanuman Chalisa", "stotra", "hindu", "Hanuman", "Awadhi", "Tulsidas's forty verses", ["RAMA_NAVAMI", "DUSSEHRA"], "Hariharan"),
    _t("ram-raksha", "Ram Raksha Stotra", "stotra", "hindu", "Rama", "Sanskrit", "Protective hymn to Rama", ["RAMA_NAVAMI", "DUSSEHRA"]),
    _t("ramchandra-kripalu", "Shri Ramchandra Kripalu Bhajman", "bhajan", "hindu", "Rama", "Awadhi", "Tulsidas's most loved bhajan to Rama", ["RAMA_NAVAMI", "DIWALI", "DUSSEHRA"]),
    _t("durga-chalisa", "Durga Chalisa", "stotra", "hindu", "Durga", "Hindi", "Forty verses in praise of Durga", ["NAVRATRI", "DURGA_PUJA"]),
    _t("devi-stuti", "Ya Devi Sarva Bhuteshu", "stotra", "hindu", "Devi", "Sanskrit", "From the Devi Mahatmya, chanted through Navratri", ["NAVRATRI", "DURGA_PUJA", "DUSSEHRA"]),
    _t("jai-ambe-gauri", "Jai Ambe Gauri", "aarti", "hindu", "Durga", "Hindi", "The aarti of Navratri evenings", ["NAVRATRI", "DURGA_PUJA"]),
    _t("aigiri-nandini", "Aigiri Nandini (Mahishasura Mardini Stotram)", "stotra", "hindu", "Durga", "Sanskrit", "The victory hymn of Durga", ["NAVRATRI", "DURGA_PUJA"]),
    _t("mahalaya", "Mahishasuramardini (Mahalaya)", "recitation", "hindu", "Durga", "Bengali", "The pre-dawn Mahalaya recitation that opens Durga Puja", ["DURGA_PUJA"], "Birendra Krishna Bhadra"),
    _t("shiv-tandav", "Shiv Tandav Stotram", "stotra", "hindu", "Shiva", "Sanskrit", "Ravana's hymn to Shiva", ["MAHA_SHIVARATRI"]),
    _t("mahamrityunjaya", "Mahamrityunjaya Mantra", "mantra", "hindu", "Shiva", "Sanskrit", "The mantra for health and protection", ["MAHA_SHIVARATRI"]),
    _t("lingashtakam", "Lingashtakam", "stotra", "hindu", "Shiva", "Sanskrit", "Eight verses to the Shiva lingam", ["MAHA_SHIVARATRI"]),
    _t("shiv-aarti", "Om Jai Shiv Omkara", "aarti", "hindu", "Shiva", "Hindi", "Shiva's aarti", ["MAHA_SHIVARATRI"]),
    _t("achyutam", "Achyutam Keshavam", "bhajan", "hindu", "Krishna", "Sanskrit", "A gentle night-time devotion to Krishna", ["JANMASHTAMI"]),
    _t("madhurashtakam", "Madhurashtakam", "stotra", "hindu", "Krishna", "Sanskrit", "Vallabhacharya's eight verses on Krishna's sweetness", ["JANMASHTAMI"]),
    _t("hare-krishna", "Hare Krishna Maha Mantra", "kirtan", "hindu", "Krishna", "Sanskrit", "The sixteen-word kirtan", ["JANMASHTAMI", "HOLI"]),
    _t("holi-khele", "Holi Khele Raghuveera", "bhajan", "hindu", "Rama", "Awadhi", "The folk bhajan of Holi", ["HOLI"]),
    _t("vishnu-sahasranamam", "Vishnu Sahasranamam", "stotra", "hindu", "Vishnu", "Sanskrit", "A thousand names of Vishnu", ["UGADI", "JANMASHTAMI"], "M. S. Subbulakshmi"),
    _t("venkateswara-suprabhatam", "Sri Venkateswara Suprabhatam", "stotra", "hindu", "Venkateswara", "Sanskrit", "The dawn awakening of the Lord of Tirumala", ["UGADI", "NEW_YEAR"], "M. S. Subbulakshmi"),
    _t("aditya-hridayam", "Aditya Hridayam", "stotra", "hindu", "Surya", "Sanskrit", "Hymn to the Sun, for the harvest festivals", ["PONGAL", "MAKAR_SANKRANTI"]),
    _t("gayatri", "Gayatri Mantra", "mantra", "hindu", "Savitri", "Sanskrit", "The sunrise mantra", ["MAKAR_SANKRANTI", "UGADI"]),
    _t("saraswati-vandana", "Ya Kundendu Tusharahara Dhavala", "stotra", "hindu", "Saraswati", "Sanskrit", "Saraswati Vandana for Vasant Panchami", ["VASANT_PANCHAMI"]),
    _t("saraswati-aarti", "Om Jai Saraswati Mata", "aarti", "hindu", "Saraswati", "Hindi", "Saraswati's aarti", ["VASANT_PANCHAMI"]),
    _t("thiruppavai", "Thiruppavai", "hymn", "hindu", "Andal", "Tamil", "Andal's thirty verses of the Margazhi month", ["PONGAL"]),
    _t("maveli-nadu", "Maveli Nadu Vaneedum Kalam", "bhajan", "hindu", "Onam", "Malayalam", "The Onam folk song of King Mahabali", ["ONAM"]),
    _t("harivarasanam", "Harivarasanam", "stotra", "hindu", "Ayyappa", "Sanskrit", "The lullaby to Ayyappa at Sabarimala", ["MAKAR_SANKRANTI"]),
    # ------------------------------------------------------------------------------- Buddhist
    _t("tisarana", "Buddham Saranam Gacchami", "chant", "buddhist", "The Three Refuges", "Pali", "The refuge chant", ["BUDDHA_PURNIMA"]),
    _t("metta-sutta", "Karaniya Metta Sutta", "chant", "buddhist", "Loving-kindness", "Pali", "The discourse on loving-kindness", ["BUDDHA_PURNIMA"]),
    _t("om-mani-padme", "Om Mani Padme Hum", "chant", "buddhist", "Avalokiteshvara", "Sanskrit", "The six-syllable mantra of compassion", ["BUDDHA_PURNIMA"]),
    # ------------------------------------------------------------------------------------ Jain
    _t("navkar", "Navkar Mantra", "mantra", "jain", "The Five Supreme Beings", "Prakrit", "The core Jain prayer", ["MAHAVIR_JAYANTI", "PARYUSHAN"]),
    _t("bhaktamar", "Bhaktamar Stotra", "stotra", "jain", "Rishabhanatha", "Sanskrit", "Acharya Manatunga's hymn", ["MAHAVIR_JAYANTI", "PARYUSHAN"]),
    # ------------------------------------------------------------------------------------ Sikh
    _t("japji-sahib", "Japji Sahib", "recitation", "sikh", "Guru Nanak", "Gurmukhi", "The morning prayer that opens the Guru Granth Sahib", ["GURPURAB", "VAISAKHI", "BANDI_CHHOR"]),
    _t("anand-sahib", "Anand Sahib", "recitation", "sikh", "Guru Amar Das", "Gurmukhi", "The song of bliss", ["GURPURAB", "VAISAKHI", "BANDI_CHHOR"]),
    _t("waheguru-simran", "Waheguru Simran", "kirtan", "sikh", "Waheguru", "Gurmukhi", "Meditative repetition of the Name", ["GURPURAB", "VAISAKHI", "BANDI_CHHOR"]),
    _t("chaupai-sahib", "Chaupai Sahib", "recitation", "sikh", "Guru Gobind Singh", "Gurmukhi", "A prayer for protection", ["VAISAKHI"]),
    # ------------------------------------------------------------------------------ Christian
    _t("silent-night", "Silent Night", "carol", "christian", "Christmas", "English", "The most loved carol", ["CHRISTMAS"]),
    _t("o-come-all", "O Come, All Ye Faithful", "carol", "christian", "Christmas", "English", "Adeste Fideles", ["CHRISTMAS"]),
    _t("joy-to-the-world", "Joy to the World", "carol", "christian", "Christmas", "English", "Isaac Watts's carol", ["CHRISTMAS"]),
    _t("o-holy-night", "O Holy Night", "carol", "christian", "Christmas", "English", "A Christmas Eve favourite", ["CHRISTMAS"]),
    _t("hark-herald", "Hark! The Herald Angels Sing", "carol", "christian", "Christmas", "English", "Charles Wesley's carol", ["CHRISTMAS"]),
    _t("we-three-kings", "We Three Kings", "carol", "christian", "Epiphany", "English", "The Magi's carol", ["EPIPHANY"]),
    _t("hallelujah-chorus", "Hallelujah Chorus (Handel's Messiah)", "hymn", "christian", "Praise", "English", "Handel's chorus, for Christmas and Easter", ["CHRISTMAS", "EASTER"]),
    _t("christ-risen", "Christ the Lord Is Risen Today", "hymn", "christian", "Easter", "English", "Charles Wesley's Easter hymn", ["EASTER"]),
    _t("thine-be-glory", "Thine Be the Glory", "hymn", "christian", "Easter", "English", "The Easter victory hymn", ["EASTER"]),
    _t("wondrous-cross", "When I Survey the Wondrous Cross", "hymn", "christian", "Good Friday", "English", "Isaac Watts's Passion hymn", ["GOOD_FRIDAY"]),
    _t("were-you-there", "Were You There?", "hymn", "christian", "Good Friday", "English", "The spiritual of Good Friday", ["GOOD_FRIDAY"]),
    _t("great-is-thy-faithfulness", "Great Is Thy Faithfulness", "hymn", "christian", "Thanksgiving", "English", "A hymn for a new year", ["NEW_YEAR"]),
    # ------------------------------------------------------------------------------- Muslim
    _t("eid-takbir", "Eid Takbir", "chant", "muslim", "Eid", "Arabic", "Allahu Akbar, chanted on the way to Eid prayers", ["EID", "EID_AL_FITR", "EID_AL_ADHA"]),
    _t("asma-ul-husna", "Asma ul Husna (99 Names of Allah)", "naat", "muslim", "The Names of Allah", "Arabic", "The ninety-nine names", ["RAMADAN", "EID", "EID_AL_FITR"]),
    _t("ar-rahman", "Surah Ar-Rahman", "recitation", "muslim", "Quran", "Arabic", "A recitation for Ramadan evenings", ["RAMADAN"], "Mishary Rashid Alafasy"),
    _t("tala-al-badru", "Tala'a al-Badru 'Alayna", "naat", "muslim", "The Prophet", "Arabic", "The welcome song of Madinah", ["MILAD_UN_NABI"]),
    _t("qasida-burda", "Qasida Burda Sharif", "naat", "muslim", "The Prophet", "Arabic", "Imam al-Busiri's poem in praise of the Prophet", ["MILAD_UN_NABI"]),
    _t("surah-yaseen", "Surah Yaseen", "recitation", "muslim", "Quran", "Arabic", "A recitation for reflection", ["MUHARRAM"]),
    # --------------------------------------------------------------------------------- Parsi
    _t("ashem-vohu", "Ashem Vohu", "chant", "parsi", "Asha (truth)", "Avestan", "One of the central Zoroastrian prayers", ["NAVROZ"]),
    _t("ahunavar", "Yatha Ahu Vairyo", "chant", "parsi", "Ahunavar", "Avestan", "The most sacred Zoroastrian prayer", ["NAVROZ"]),
)  # fmt: skip
