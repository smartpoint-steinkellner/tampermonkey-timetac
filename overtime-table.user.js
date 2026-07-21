// ==UserScript==
// @name         Overtime Table
// @version      2026-07-21
// @downloadURL  https://github.com/smartpoint-steinkellner/tampermonkey-timetac/raw/refs/heads/main/overtime-table.user.js
// @description  Summarize overtime and days spent at the office / home office
// @author       Sebastian Steinkellner
// @match        https://go.timetac.com/smartpoint
// @icon         https://static.timetac.com/img/timetac.png
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    class ArgUtil {
        static checkRequired(argumentsDictionary, actionDescription = null) {
            const missingArguments = [];

            for (const argumentName in argumentsDictionary) {
                const argument = argumentsDictionary[argumentName];

                if (argument === null || argument === undefined) {
                    missingArguments.push(argumentName);
                }
            }

            if (!missingArguments.length) {
                return;
            }

            if (actionDescription) {
                actionDescription = ' to ' + actionDescription;
            }
            const errorMessage = `Missing required arguments${actionDescription}: ${missingArguments.join(', ')}`;
            throw new Error(errorMessage);
        }
    }

    class QueryUtil {
        static intervalSelector(
        container,
         query,
         intervalTimeout = 100,
         condition = null
        ) {
            ArgUtil.checkRequired(
                {
                    container,
                    query,
                    intervalTimeout,
                },
                'query'
            );

            return QueryUtil.intervalQuery(
                () => container.querySelector(query),
                intervalTimeout
            );
        }

        static intervalSelectorAll(
        container,
         query,
         intervalTimeout = 100,
         condition = null
        ) {
            ArgUtil.checkRequired(
                {
                    container,
                    query,
                    intervalTimeout,
                },
                'query'
            );

            return QueryUtil.intervalQuery(
                () => container.querySelectorAll(query),
                intervalTimeout
            );
        }

        static intervalQuery(query, intervalTimeout, condition = null) {
            ArgUtil.checkRequired(
                {
                    query,
                    intervalTimeout,
                },
                'query'
            );

            condition ??= (element) => !!element;

            return new Promise((resolve, reject) => {
                const overtimeTabInterval = setInterval(() => {
                    const element = query();

                    if (condition(element)) {
                        clearInterval(overtimeTabInterval);
                        resolve(element);
                    }
                }, intervalTimeout);
            });
        }
    }

    class Tab {
        constructor(tabId, htmlElement, activeClass = 'x-tab-active') {
            ArgUtil.checkRequired(
                {
                    tabId,
                    htmlElement,
                    activeClass,
                },
                'create Tab'
            );

            this.tabId = tabId;
            this.htmlElement = htmlElement;
            this.activeClass = activeClass;
        }

        isActive() {
            const classList = this.htmlElement.classList;
            // console.debug('tab', this.tabId, 'classList', classList);
            return classList.contains(this.activeClass);
        }

        activate() {
            this.htmlElement.click();
        }

        onActivation(eventListener) {
            this.htmlElement.addEventListener('click', eventListener);
        }

        static async find(tabId, container = document, intervalTimeout = 100) {
            ArgUtil.checkRequired(
                {
                    tabId,
                },
                'find Tab'
            );

            const tab = await QueryUtil.intervalSelector(
                container,
                `a[data-userguidingid=${tabId}]`,
                intervalTimeout
            );
            console.debug('tab', tabId, tab);
            return new Tab(tabId, tab);
        }
    }

    function createTableContainer(tableColumns, container = document.body) {
        const tableContainer = container.appendChild(document.createElement('aside'));
        tableContainer.id = 'overtime-table-container';

        const containerTitle = tableContainer.appendChild(
            document.createElement('b')
        );
        containerTitle.innerText = 'Saldo';

        const table = tableContainer.appendChild(document.createElement('table'));
        const tableHeader = table.appendChild(document.createElement('thead'));
        const tableHeaderRow = tableHeader.appendChild(document.createElement('tr'));
        for (const title of tableColumns) {
            tableHeader.appendChild(document.createElement('th')).innerHTML = title;
        }

        const tableBody = table.appendChild(document.createElement('tbody'));

        const refreshButton = tableContainer.appendChild(
            document.createElement('button')
        );
        refreshButton.innerText = 'Zusammenfassen';

        /*
	const author = tableContainer.appendChild(document.createElement('p'));
	author.id = 'overtime-table-container-author';
	author.innerText = 'by SST';
	*/

        return {
            addClickListener: (action) =>
            refreshButton.addEventListener('click', action),
            clearTable: () => {
                while (tableBody.children.length) {
                    tableBody.removeChild(tableBody.children[0]);
                }
            },
            addTableRow: (elements) => {
                const tableRow = tableBody.appendChild(document.createElement('tr'));
                for (const element of elements) {
                    const tableCell = tableRow.appendChild(document.createElement('td'));
                    if (element instanceof Node) {
                        tableCell.appendChild(element);
                    } else {
                        tableCell.innerText = element;
                    }
                }
            },
            keepOpen: (open) => tableContainer.classList.toggle('open', open),
            setSaldo: (saldo, absolute) => {
                let additionalInfo = createSaldoSpanOuterHTML(saldo);
                if (!additionalInfo) {
                    containerTitle.innerText = 'Saldo';
                    return;
                }

                const absoluteSpan = createSaldoSpanOuterHTML(absolute);
                if (absoluteSpan) {
                    additionalInfo += ' => ' + absoluteSpan;
                }

                containerTitle.innerHTML = 'Saldo: ' + additionalInfo;
            },
        };
    }

    function createSaldoSpanOuterHTML(saldo) {
        if (isNaN(saldo)) {
            return null;
        }

        const saldoClass = saldo < 0 ? 'font-red' : 'font-green';
        return `<span class="${saldoClass}">${saldo}</span>`;
    }

    class DataGrid {
        static headerIdAttributeName = 'data-componentid';
        static columnIdAttributeName = 'data-columnid';

        constructor(grid) {
            this.container = grid.parentElement;
        }

        async getColumnIds() {
            const tableHeaders = await QueryUtil.intervalSelectorAll(
                this.container,
                `div[${DataGrid.headerIdAttributeName}]`,
                100,
                div => div.querySelector('.x-column-header-text')
            );

            const columnIds = [...tableHeaders].reduce((dictionary, current) => {
                const value = current
                .querySelector('.x-column-header-text')
                ?.innerText?.trim();
                if (!value?.length) {
                    return dictionary;
                }

                const id = current.getAttribute(DataGrid.headerIdAttributeName);
                dictionary[value] = id;
                return dictionary;
            }, {});

            console.debug('columnIds', columnIds);
            return columnIds;
        }

        async getColumnId(columnName) {
            const columnIds = (this.columnIds ??= await this.getColumnIds());
            return DataGrid._getColumnIdInternal(columnIds, columnName);
        }

        static _getColumnIdInternal(columnIds, columnName) {
            const columnId = columnIds[columnName];
            if (!columnId) {
                console.warn(
                    `Can't find id for columnName '${columnName}' in`,
                    columnIds
                );
            }

            return columnId;
        }

        async getGridColumnValueSelector(row) {
            const columnIds = (this.columnIds ??= await this.getColumnIds());

            return (columnName) => {
                const columnId = DataGrid._getColumnIdInternal(columnIds, columnName);
                if (!columnId) {
                    return null;
                }

                return row
                    .querySelector(`td[data-columnid=${columnId}]`)
                    ?.innerText?.trim();
            };
        }
    }

    async function collectData(grid) {
        const dataGrid = new DataGrid(grid);
        const dayColumnId = await dataGrid.getColumnId('W');

        await QueryUtil.intervalSelector(grid, `td[data-columnid=${dayColumnId}]`);

        const gridRows = grid.querySelectorAll('tr');
        const monthData = { sum: {}, weeks: [] };
        let currentWeek = null;

        for (const row of gridRows) {
            const group = row
                .querySelector('td.x-group-hd-container')
                ?.innerText?.trim();
            if (group) {
                currentWeek = { group: group.replace(/(^KW|:$)/g, ''), days: [], office: 0, homeOffice: 0 };
                if (group?.startsWith('KW')) {
                    monthData.weeks.push(currentWeek);
                } else {
                    monthData.sum = currentWeek;
                }

                continue;
            } else if(!currentWeek){
                continue;
            }

            const getGridColumnValue = await dataGrid.getGridColumnValueSelector(row);

            const date = getGridColumnValue('Datum');
            const time = getGridColumnValue('AZ');
            const saldo = getGridColumnValue('TS');

            if (!date) {
                currentWeek.time = time;
                if (!isNaN(saldo)) {
                    currentWeek.saldo = saldo;
                }

                console.log('currentWeek', currentWeek);
                continue;
            }

            const day = getGridColumnValue('W');
            const isHomeOffice = !!getGridColumnValue('HO');
            const currentDay = { day, date, time, saldo, isHomeOffice };
            // console.debug('currentDay', currentDay);
            currentWeek.days.push(currentDay);

            const absolute = getGridColumnValue('AS');
            if (!!absolute && !isNaN(absolute)) {
                currentWeek.absolute = absolute;
            }

            if (!!time && !isNaN(time)){
                if (isHomeOffice){
                    currentWeek.homeOffice++;
                } else {
                    currentWeek.office++;
                }
            }
        }

        monthData.sum.absolute =
            monthData.weeks.map(w => w?.absolute).filter(a => !!a).at(-1);
        console.debug('monthData', monthData);
        return monthData;
    }

    function createCss(){
        const style = document.head.appendChild(document.createElement('style'));
        style.innerText = `
#overtime-table-container {
	position: fixed;
	top: 0;
	left: 20vw;

	z-index: 10;

	background: white;

	border: 1px solid black;
	border-top: none;
	border-bottom-left-radius: 10px;
	border-bottom-right-radius: 10px;
	padding: 10px;

	display: flex;
	flex-direction: column;
	gap: 10px;

	table {
		border-collapse: collapse;

		th,
		td {
			padding: 2px 10px;
		}

		&,
		td {
			border: 1px solid black;
		}

        tr td:first-child {
            font-weight: bold;
		}

        tr td:first-child,
        td > div {
            text-align: center
        }
	}

	&:not(:hover):not(.open) {
		table,
		button {
			display: none;
		}
	}

	#overtime-table-container-author {
		position: relative;
		bottom: -5px;
		right: 20px;
		transform: rotate(-30deg);
	}
}`;
    }

    window.addEventListener('load', async (loadEvent) => {
        createCss();

        const overtimeTab = (window.overtimeTab = await Tab.find(
            'maintab-overtime_holiday'
        ));

        const weekDays = ['Mon', 'Die', 'Mit', 'Don', 'Fre', 'Sam', 'Son'];
        const tableContainer = createTableContainer(['KW', ...weekDays, '&sum;', 'B | HO']);

        function* createEmptyCells(count) {
            for (var i = 0; i < count; i++) {
                yield null;
            }
        }

        function createTimeCell(time, saldo, absolute) {
            if ((!time || time == 0) && (!saldo || saldo == 0)) {
                return null;
            }

            const cellContainer = document.createElement('div');
            if (saldo == 'nm') {
                cellContainer.innerHTML = !!time ? `${time}<br />Heute` : 'Heute';
                return cellContainer;
            }

            let additionalInfo = createSaldoSpanOuterHTML(saldo);
            const absoluteSpan = createSaldoSpanOuterHTML(absolute);
            if (absoluteSpan) {
                additionalInfo += ' => ' + absoluteSpan;
            }

            cellContainer.innerHTML = `${time}<br />${additionalInfo}`;
            return cellContainer;
        }

        function createHomeOfficeCell(officeDays, homeOfficeDays) {
            if ((!officeDays || officeDays == 0) && (!homeOfficeDays || homeOfficeDays == 0)) {
                return null;
            }

            const cellContainer = document.createElement('div');
            cellContainer.innerText = `${officeDays} | ${homeOfficeDays}`;
            cellContainer.classList.add(officeDays >= 2 ? 'font-green' : 'font-red');

            return cellContainer;
        }

        tableContainer.addClickListener(async (clickEvent) => {
            if (!overtimeTab.isActive()) {
                overtimeTab.activate();
            }

            var grid = await QueryUtil.intervalSelector(
                document,
                '#grid_timesheet_accounting-body'
            );

            const monthData = await collectData(grid);

            tableContainer.clearTable();
            for (const weekData of monthData.weeks) {
                if (weekData.saldo == 0){
                    continue;
                }

                const days = weekData.days;

                let weekCells = [];
                for (var day of days) {
                    weekCells.push(createTimeCell(day.time, day.saldo));
                }

                const missingDays = 7 - days.length;
                if (missingDays) {
                    const firstDayIndex = weekDays.indexOf(days[0]?.day);
                    if (firstDayIndex < 0) {
                        console.error(
                            'unable to find index of',
                            days[0]?.day,
                            'in',
                            weekDays
                        );
                    } else {
                        weekCells = [
                            ...createEmptyCells(firstDayIndex),
                            ...weekCells,
                            ...createEmptyCells(missingDays - firstDayIndex),
                        ];
                    }
                }

                tableContainer.addTableRow([
                    weekData.group,
                    ...weekCells,
                    createTimeCell(weekData.time, weekData.saldo, weekData.absolute),
                    createHomeOfficeCell(weekData.office, weekData.homeOffice),
                ]);
            }

            tableContainer.setSaldo(monthData.sum.saldo, monthData.sum.absolute);
        });

        /*
        const observer = new MutationObserver((mutationList) => {
            mutationList
                .filter((m) => m.type === 'childList')
                .forEach((mutation) => {
                console.log(`Child ${mutation.childList} changed`);
            });
        });

        observer.observe(grid, { childList: true });
*/
    });
})();
