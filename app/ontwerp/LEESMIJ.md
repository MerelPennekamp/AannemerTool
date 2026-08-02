# Schermen om over te zetten

`schermen.html` is de volledige interface zoals die op de oude serverversie
draaide: Gantt, week- en maandweergave, taakdetail, waarschuwingen,
bestellingen, vaklui en budget. Inclusief het kleurenpalet dat op
kleurenblindheid en contrast is gecontroleerd, in licht en donker.

Hij draait niet meer: hij haalt zijn gegevens op bij `/api/...`, en die server
bestaat niet meer. De vervanger is `src/model.ts`, die hetzelfde uitrekent maar
dan in de browser.

Deze map wordt niet meegebouwd. Hij staat hier als bron voor de overzetting,
scherm voor scherm. Is alles overgezet, dan mag de map weg.
