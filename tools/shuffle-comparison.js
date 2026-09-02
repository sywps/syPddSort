(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.ControlledShuffle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const DIRS8 = [...DIRS4, [-1, -1], [-1, 1], [1, -1], [1, 1]];

    function createRng(seed) {
        let state = (Number(seed) || 1) >>> 0;
        return function () {
            state += 0x6D2B79F5;
            let value = state;
            value = Math.imul(value ^ value >>> 15, value | 1);
            value ^= value + Math.imul(value ^ value >>> 7, value | 61);
            return ((value ^ value >>> 14) >>> 0) / 4294967296;
        };
    }

    function hashCell(seed, row, col) {
        let value = (seed ^ Math.imul(row + 1, 73856093) ^ Math.imul(col + 1, 19349663)) >>> 0;
        value = Math.imul(value ^ value >>> 16, 2246822519) >>> 0;
        return (value ^ value >>> 13) >>> 0;
    }

    function activeCells(grid) {
        const cells = [];
        grid.forEach((line, row) => line.forEach((color, col) => {
            if (color > 0) cells.push([row, col]);
        }));
        return cells;
    }

    function colorInventory(grid) {
        const counts = new Map();
        activeCells(grid).forEach(([row, col]) => {
            const color = grid[row][col];
            counts.set(color, (counts.get(color) || 0) + 1);
        });
        return counts;
    }

    function matchingCellCount(target, grid) {
        return activeCells(target).reduce((count, [row, col]) => (
            count + (target[row][col] === grid[row][col] ? 1 : 0)
        ), 0);
    }

    function minimumMatchCount(target) {
        const inventory = colorInventory(target);
        const total = [...inventory.values()].reduce((sum, count) => sum + count, 0);
        const largestColorCount = Math.max(0, ...inventory.values());
        return Math.max(0, largestColorCount * 2 - total);
    }

    function assertOutline(reference, grid) {
        if (reference.length !== grid.length || reference.some((row, index) => row.length !== grid[index]?.length)) {
            throw new Error('shuffle dimensions differ from the reference outline');
        }
        for (let row = 0; row < reference.length; row += 1) {
            for (let col = 0; col < reference[row].length; col += 1) {
                if ((reference[row][col] > 0) !== (grid[row][col] > 0)) {
                    throw new Error(`shuffle outline changed at row ${row}, col ${col}`);
                }
            }
        }
    }

    function generateInterleaved(target, options = {}) {
        if (!Array.isArray(target) || !target.length || !Array.isArray(target[0])) {
            throw new Error('target grid must be a non-empty 2D array');
        }
        const width = target[0].length;
        if (!width || target.some(row => !Array.isArray(row) || row.length !== width)) {
            throw new Error('target grid rows must have equal width');
        }
        const levelId = Number(options.levelId) || 0;
        const seed = Number.isFinite(options.seed) ? Number(options.seed) : 20260827 + levelId * 7919;
        const rng = createRng(seed);
        const cells = activeCells(target);
        const remaining = colorInventory(target);
        const totals = new Map(remaining);
        const result = target.map(row => row.map(value => value > 0 ? -1 : value));
        const lastPlaced = new Map();

        cells.sort((a, b) => {
            const parityA = (a[0] + a[1]) & 1;
            const parityB = (b[0] + b[1]) & 1;
            if (parityA !== parityB) return parityA - parityB;
            return hashCell(seed, a[0], a[1]) - hashCell(seed, b[0], b[1]);
        });

        cells.forEach(([row, col], step) => {
            let bestColor = null;
            let bestScore = -Infinity;
            for (const [color, count] of remaining) {
                if (count <= 0) continue;
                let sameNeighbors = 0;
                let placedNeighbors = 0;
                for (const [dr, dc] of DIRS4) {
                    const nr = row + dr;
                    const nc = col + dc;
                    if (nr < 0 || nc < 0 || nr >= result.length || nc >= width) continue;
                    if (result[nr][nc] <= 0) continue;
                    placedNeighbors += 1;
                    if (result[nr][nc] === color) sameNeighbors += 1;
                }
                const quotaPressure = count / totals.get(color);
                const mismatchReward = target[row][col] === color ? -8.5 : 5.5;
                const neighborScore = sameNeighbors === 0 ? -0.45 : sameNeighbors === 1 ? 4.2 : sameNeighbors === 2 ? 1.8 : -5.0;
                const isolationPenalty = placedNeighbors >= 2 && sameNeighbors === 0 ? -2.0 : 0;
                const previous = lastPlaced.get(color);
                const repeatPenalty = previous === step - 1 ? -2.5 : 0;
                const jitter = rng() * 0.2;
                const score = mismatchReward + quotaPressure * 3.2 + neighborScore + isolationPenalty + repeatPenalty + jitter;
                if (score > bestScore) {
                    bestScore = score;
                    bestColor = color;
                }
            }
            if (bestColor === null) throw new Error('shuffle inventory exhausted before grid assignment');
            result[row][col] = bestColor;
            remaining.set(bestColor, remaining.get(bestColor) - 1);
            lastPlaced.set(bestColor, step);
        });

        repairMatches(target, result, cells, seed);
        assertOutline(target, result);
        return result;
    }

    function cohortKey(colorCount) {
        if (colorCount <= 5) return 'low';
        if (colorCount <= 9) return 'mid';
        return 'high';
    }

    function learnProfile(levels) {
        const cohorts = { low: [], mid: [], high: [] };
        for (const level of levels || []) {
            if (!level?.correctColorArr || !level?.initRandomColorArr) continue;
            const colors = colorInventory(level.correctColorArr).size;
            cohorts[cohortKey(colors)].push(metrics(level.correctColorArr, level.initRandomColorArr));
        }
        const fallback = Object.values(cohorts).flat();
        const average = items => {
            const source = items.length ? items : fallback;
            const keys = ['displacement', 'sameNeighborRatio', 'singletonRatio', 'componentsPerColor', 'largestCluster'];
            return Object.fromEntries(keys.map(key => [key, source.reduce((sum, item) => sum + item[key], 0) / Math.max(1, source.length)]));
        };
        return {
            count: fallback.length,
            cohorts: Object.fromEntries(Object.entries(cohorts).map(([key, items]) => [key, { count: items.length, ...average(items) }])),
        };
    }

    function splitQuota(total, groups) {
        const base = Math.floor(total / groups);
        return Array.from({ length: groups }, (_, index) => base + (index < total % groups ? 1 : 0));
    }

    function buildSwapPartners(inventory) {
        const colors = [...inventory.keys()].sort((left, right) => inventory.get(left) - inventory.get(right) || left - right);
        const partners = new Map();
        for (let index = 0; index + 1 < colors.length; index += 2) {
            partners.set(colors[index], colors[index + 1]);
            partners.set(colors[index + 1], colors[index]);
        }
        if (colors.length % 2 === 1 && colors.length > 1) {
            const color = colors.at(-1);
            const candidates = colors.slice(0, -1);
            const partner = candidates.reduce((best, candidate) => (
                Math.abs(inventory.get(candidate) - inventory.get(color)) < Math.abs(inventory.get(best) - inventory.get(color))
                    ? candidate : best
            ));
            partners.set(color, partner);
        }
        return partners;
    }

    function generateClusteredCandidate(target, seed, maxGroups, neighborDirs = DIRS8) {
        const cells = activeCells(target);
        const inventory = colorInventory(target);
        const swapPartners = buildSwapPartners(inventory);
        const unassigned = new Set(cells.map(([row, col]) => `${row},${col}`));
        const groups = [];
        const taken = new Set();
        const parse = key => key.split(',').map(Number);
        const distance = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

        for (const [color, total] of [...inventory].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
            const partnerColor = swapPartners.get(color);
            const groupCount = Math.max(1, Math.min(maxGroups, total < 24 ? 1 : total < 80 ? 2 : 3));
            const quotas = splitQuota(total, groupCount);
            const targetCells = cells.filter(([row, col]) => target[row][col] === color);
            const centroid = [
                targetCells.reduce((sum, cell) => sum + cell[0], 0) / targetCells.length,
                targetCells.reduce((sum, cell) => sum + cell[1], 0) / targetCells.length,
            ];
            const colorSeeds = [];
            for (const quota of quotas) {
                const candidates = cells.filter(([row, col]) => !taken.has(`${row},${col}`));
                candidates.sort((a, b) => {
                    const score = cell => {
                        const targetColor = target[cell[0]][cell[1]];
                        const wrong = targetColor === color ? 0 : targetColor === partnerColor ? 24 : 8;
                        const spread = colorSeeds.length ? Math.min(...colorSeeds.map(seedCell => distance(cell, seedCell))) * 1.3 : 0;
                        return wrong + distance(cell, centroid) * 0.7 + spread
                            + hashCell(seed ^ color, cell[0], cell[1]) / 4294967296 * 0.01;
                    };
                    return score(b) - score(a);
                });
                const seedCell = candidates[0];
                const key = `${seedCell[0]},${seedCell[1]}`;
                taken.add(key);
                unassigned.delete(key);
                colorSeeds.push(seedCell);
                groups.push({ color, quota, cells: [seedCell], frontier: new Set(), seed: seedCell });
            }
        }

        const addFrontier = (group, cell) => {
            for (const [dr, dc] of neighborDirs) {
                const key = `${cell[0] + dr},${cell[1] + dc}`;
                if (unassigned.has(key)) group.frontier.add(key);
            }
        };
        groups.forEach(group => addFrontier(group, group.seed));
        while (unassigned.size) {
            let progressed = false;
            for (const group of groups.slice().sort((a, b) => (b.quota - b.cells.length) - (a.quota - a.cells.length))) {
                if (group.cells.length >= group.quota) continue;
                const frontier = [...group.frontier].filter(key => unassigned.has(key));
                let chosenKey;
                if (frontier.length) {
                    chosenKey = frontier.reduce((best, key) => {
                        const cell = parse(key);
                        const bestCell = parse(best);
                        const score = value => distance(value, group.seed)
                            + (target[value[0]][value[1]] === group.color ? 18 : 0)
                            + hashCell(seed ^ group.color, value[0], value[1]) / 4294967296 * 0.01;
                        return score(cell) < score(bestCell) ? key : best;
                    });
                } else {
                    chosenKey = unassigned.values().next().value;
                }
                const chosen = parse(chosenKey);
                group.cells.push(chosen);
                group.frontier.delete(chosenKey);
                unassigned.delete(chosenKey);
                addFrontier(group, chosen);
                progressed = true;
                if (!unassigned.size) break;
            }
            if (!progressed) break;
        }

        const result = target.map(row => row.map(value => value > 0 ? -1 : value));
        groups.forEach(group => group.cells.forEach(([row, col]) => { result[row][col] = group.color; }));
        if (activeCells(result).length !== cells.length) throw new Error('clustered shuffle did not fill every active cell');
        return result;
    }

    function generateStrictBandLayout(target, seed) {
        const inventory = colorInventory(target);
        const colors = [...inventory.keys()].sort((left, right) => (
            hashCell(seed, left, 0) - hashCell(seed, right, 0) || left - right
        ));
        const colorOrder = new Map(colors.map((color, index) => [color, index]));
        const cells = activeCells(target).sort((left, right) => (
            colorOrder.get(target[left[0]][left[1]]) - colorOrder.get(target[right[0]][right[1]])
            || left[0] - right[0]
            || left[1] - right[1]
        ));
        const values = colors.flatMap(color => Array.from({ length: inventory.get(color) }, () => color));
        const offset = Math.max(...inventory.values());
        const result = target.map(row => row.map(value => value > 0 ? -1 : value));
        cells.forEach(([row, col], index) => {
            result[row][col] = values[(index + offset) % values.length];
        });
        return result;
    }

    function fragmentScore(target, grid) {
        const visited = new Set();
        let penalty = 0;
        let smallCells = 0;
        let sameEdges = 0;
        for (let row = 0; row < grid.length; row += 1) {
            for (let col = 0; col < grid[row].length; col += 1) {
                if (target[row][col] <= 0) continue;
                if (col + 1 < grid[row].length && target[row][col + 1] > 0 && grid[row][col] === grid[row][col + 1]) {
                    sameEdges += 1;
                }
                if (row + 1 < grid.length && target[row + 1][col] > 0 && grid[row][col] === grid[row + 1][col]) {
                    sameEdges += 1;
                }
                const key = `${row},${col}`;
                if (visited.has(key)) continue;
                const color = grid[row][col];
                const queue = [[row, col]];
                visited.add(key);
                let size = 0;
                while (queue.length) {
                    const [currentRow, currentCol] = queue.pop();
                    size += 1;
                    for (const [dr, dc] of DIRS4) {
                        const nextRow = currentRow + dr;
                        const nextCol = currentCol + dc;
                        const nextKey = `${nextRow},${nextCol}`;
                        if (
                            nextRow < 0 || nextCol < 0 || nextRow >= grid.length || nextCol >= grid[0].length
                            || visited.has(nextKey) || target[nextRow][nextCol] <= 0 || grid[nextRow][nextCol] !== color
                        ) continue;
                        visited.add(nextKey);
                        queue.push([nextRow, nextCol]);
                    }
                }
                if (size <= 3) smallCells += size;
                if (size === 1) penalty += 16;
                else if (size === 2) penalty += 6;
                else if (size === 3) penalty += 2;
            }
        }
        return { penalty, smallCells, sameEdges };
    }

    function generateStrictBandCandidate(target, seed) {
        const variantCount = activeCells(target).length <= 800 ? 5 : 3;
        let best = null;
        for (let variant = 0; variant < variantCount; variant += 1) {
            const variantSeed = (seed + variant * 0x9E3779B9) >>> 0;
            const candidate = mergeStrictFragments(target, generateStrictBandLayout(target, variantSeed), variantSeed);
            const score = fragmentScore(target, candidate);
            if (
                !best || score.penalty < best.score.penalty
                || (score.penalty === best.score.penalty && score.smallCells < best.score.smallCells)
                || (
                    score.penalty === best.score.penalty
                    && score.smallCells === best.score.smallCells
                    && score.sameEdges > best.score.sameEdges
                )
            ) {
                best = { grid: candidate, score };
            }
        }
        return best.grid;
    }

    function matchCountIsPreserved(target, grid, left, right) {
        const leftColor = grid[left[0]][left[1]];
        const rightColor = grid[right[0]][right[1]];
        const before = Number(leftColor === target[left[0]][left[1]])
            + Number(rightColor === target[right[0]][right[1]]);
        const after = Number(rightColor === target[left[0]][left[1]])
            + Number(leftColor === target[right[0]][right[1]]);
        return before === after;
    }

    function swapEdgeDelta(target, grid, left, right) {
        const width = grid[0].length;
        const leftColor = grid[left[0]][left[1]];
        const rightColor = grid[right[0]][right[1]];
        const edges = new Set();
        const addEdges = ([row, col]) => {
            for (const [dr, dc] of DIRS4) {
                const nextRow = row + dr;
                const nextCol = col + dc;
                if (
                    nextRow < 0 || nextCol < 0 || nextRow >= grid.length || nextCol >= width
                    || target[nextRow][nextCol] <= 0
                ) continue;
                const currentIndex = row * width + col;
                const nextIndex = nextRow * width + nextCol;
                edges.add(currentIndex < nextIndex ? `${currentIndex}:${nextIndex}` : `${nextIndex}:${currentIndex}`);
            }
        };
        addEdges(left);
        addEdges(right);
        let before = 0;
        let after = 0;
        const colorAfterSwap = (row, col) => {
            if (row === left[0] && col === left[1]) return rightColor;
            if (row === right[0] && col === right[1]) return leftColor;
            return grid[row][col];
        };
        for (const edge of edges) {
            const [fromIndex, toIndex] = edge.split(':').map(Number);
            const fromRow = Math.floor(fromIndex / width);
            const fromCol = fromIndex % width;
            const toRow = Math.floor(toIndex / width);
            const toCol = toIndex % width;
            if (grid[fromRow][fromCol] === grid[toRow][toCol]) before += 1;
            if (colorAfterSwap(fromRow, fromCol) === colorAfterSwap(toRow, toCol)) after += 1;
        }
        return after - before;
    }

    function sameNeighborCountAfterSwap(target, grid, cell, other) {
        const width = grid[0].length;
        const leftColor = grid[cell[0]][cell[1]];
        const rightColor = grid[other[0]][other[1]];
        let count = 0;
        for (const [dr, dc] of DIRS4) {
            const nextRow = cell[0] + dr;
            const nextCol = cell[1] + dc;
            if (
                nextRow < 0 || nextCol < 0 || nextRow >= grid.length || nextCol >= width
                || target[nextRow][nextCol] <= 0
            ) continue;
            const nextColor = nextRow === other[0] && nextCol === other[1]
                ? leftColor
                : grid[nextRow][nextCol];
            if (nextColor === rightColor) count += 1;
        }
        return count;
    }

    function mergeStrictFragments(target, grid, seed) {
        const cells = activeCells(target);
        const width = grid[0].length;
        const indexByPosition = target.map(row => row.map(() => -1));
        const positionsByColor = new Map();
        const positionSlot = new Array(cells.length);
        cells.forEach(([row, col], index) => {
            indexByPosition[row][col] = index;
            const color = grid[row][col];
            const positions = positionsByColor.get(color) || [];
            positionSlot[index] = positions.length;
            positions.push(index);
            positionsByColor.set(color, positions);
        });

        const neighborColors = ([row, col]) => {
            const colors = new Set();
            for (const [dr, dc] of DIRS4) {
                const nextRow = row + dr;
                const nextCol = col + dc;
                if (
                    nextRow < 0 || nextCol < 0 || nextRow >= grid.length || nextCol >= width
                    || target[nextRow][nextCol] <= 0
                ) continue;
                const color = grid[nextRow][nextCol];
                if (color !== grid[row][col]) colors.add(color);
            }
            return [...colors];
        };

        const applySwap = (leftIndex, rightIndex) => {
            const [leftRow, leftCol] = cells[leftIndex];
            const [rightRow, rightCol] = cells[rightIndex];
            const leftColor = grid[leftRow][leftCol];
            const rightColor = grid[rightRow][rightCol];
            const leftPositions = positionsByColor.get(leftColor);
            const rightPositions = positionsByColor.get(rightColor);
            const leftSlot = positionSlot[leftIndex];
            const rightSlot = positionSlot[rightIndex];
            leftPositions[leftSlot] = rightIndex;
            rightPositions[rightSlot] = leftIndex;
            positionSlot[rightIndex] = leftSlot;
            positionSlot[leftIndex] = rightSlot;
            grid[leftRow][leftCol] = rightColor;
            grid[rightRow][rightCol] = leftColor;
        };

        const maximumPasses = 6;
        const maximumMoves = cells.length * 2;
        let moves = 0;
        for (let pass = 0; pass < maximumPasses && moves < maximumMoves; pass += 1) {
            let moved = false;
            const order = cells.map((_cell, index) => index).sort((left, right) => {
                const leftCell = cells[left];
                const rightCell = cells[right];
                return hashCell(seed ^ (pass + 1) * 0x9E3779B9, leftCell[0], leftCell[1])
                    - hashCell(seed ^ (pass + 1) * 0x9E3779B9, rightCell[0], rightCell[1]);
            });
            for (const leftIndex of order) {
                const left = cells[leftIndex];
                const leftColor = grid[left[0]][left[1]];
                const currentNeighbors = sameNeighborCount(grid, left[0], left[1], leftColor);
                if (currentNeighbors > 1) continue;
                let best = null;
                for (const desiredColor of neighborColors(left)) {
                    const sourcePositions = positionsByColor.get(desiredColor);
                    const sampleCount = Math.min(20, sourcePositions.length);
                    const start = hashCell(seed ^ pass ^ desiredColor, left[0], left[1]) % sourcePositions.length;
                    const stride = Math.max(1, Math.floor(sourcePositions.length / sampleCount));
                    for (let sample = 0; sample < sampleCount; sample += 1) {
                        const rightIndex = sourcePositions[(start + sample * stride) % sourcePositions.length];
                        if (leftIndex === rightIndex) continue;
                        const right = cells[rightIndex];
                        if (!matchCountIsPreserved(target, grid, left, right)) continue;
                        const sourceNeighbors = sameNeighborCount(grid, right[0], right[1], desiredColor);
                        const delta = swapEdgeDelta(target, grid, left, right);
                        const sourceNeighborsAfter = sameNeighborCountAfterSwap(target, grid, right, left);
                        if (
                            delta < 0
                            || (
                                delta === 0
                                && !(currentNeighbors === 0 && sourceNeighbors >= 2 && sourceNeighborsAfter >= 1)
                            )
                        ) continue;
                        const score = delta * 100
                            + (currentNeighbors === 0 ? 16 : 0)
                            + (sourceNeighbors === 0 ? 8 : 0)
                            + hashCell(seed ^ pass, right[0], right[1]) / 4294967296;
                        if (!best || score > best.score) best = { rightIndex, score };
                    }
                }
                if (!best) continue;
                applySwap(leftIndex, best.rightIndex);
                moved = true;
                moves += 1;
                if (moves >= maximumMoves) break;
            }
            if (!moved) break;
        }
        return grid;
    }

    function profileDistance(actual, target) {
        const largestScale = Math.max(12, target.largestCluster);
        return Math.abs(actual.displacement - target.displacement) * 8
            + Math.abs(actual.sameNeighborRatio - target.sameNeighborRatio) * 10
            + Math.abs(actual.singletonRatio - target.singletonRatio) * 6
            + Math.abs(actual.componentsPerColor - target.componentsPerColor) / Math.max(3, target.componentsPerColor) * 2
            + Math.abs(actual.largestCluster - target.largestCluster) / largestScale * 3;
    }

    function generate(target, options = {}) {
        if (!options.profile?.cohorts) return generateInterleaved(target, options);
        const colors = colorInventory(target).size;
        const learned = options.profile.cohorts[cohortKey(colors)];
        const levelId = Number(options.levelId) || 0;
        const baseSeed = Number.isFinite(options.seed) ? Number(options.seed) : 20260827 + levelId * 7919;
        const strictMismatch = options.strictMismatch === true;
        if (strictMismatch) {
            const candidate = generateStrictBandCandidate(target, baseSeed);
            const minimumMatches = minimumMatchCount(target);
            assertOutline(options.outlineGrid || target, candidate);
            if (matchingCellCount(target, candidate) !== minimumMatches) {
                throw new Error(`strict mismatch could not reach the theoretical minimum of ${minimumMatches} matches`);
            }
            return candidate;
        }
        let best = null;
        for (let maxGroups = 1; maxGroups <= 3; maxGroups += 1) {
            for (let attempt = 0; attempt < 1; attempt += 1) {
                const candidate = generateClusteredCandidate(
                    target,
                    baseSeed + maxGroups * 131 + attempt * 9973,
                    maxGroups,
                    DIRS8,
                );
                const candidateMetrics = metrics(target, candidate);
                const displacementFloorPenalty = Math.max(0, 0.9 - candidateMetrics.displacement) * 24;
                const cohesionBias = -candidateMetrics.sameNeighborRatio * 4
                    + candidateMetrics.singletonRatio * 7
                    + candidateMetrics.componentsPerColor / Math.max(3, learned.componentsPerColor)
                    - candidateMetrics.largestCluster / Math.max(12, learned.largestCluster) * 2
                    - candidateMetrics.similarCountSwapRatio * 12;
                const score = profileDistance(candidateMetrics, learned) + displacementFloorPenalty + cohesionBias;
                if (!best || score < best.score) best = { grid: candidate, score };
            }
        }
        assertOutline(options.outlineGrid || target, best.grid);
        return best.grid;
    }

    function repairMatches(target, grid, cells, seed) {
        const matched = cells.filter(([row, col]) => grid[row][col] === target[row][col]);
        matched.sort((a, b) => hashCell(seed ^ 0x9E3779B9, a[0], a[1]) - hashCell(seed ^ 0x9E3779B9, b[0], b[1]));
        for (const [rowA, colA] of matched) {
            if (grid[rowA][colA] !== target[rowA][colA]) continue;
            let swapCell = null;
            let bestPenalty = Infinity;
            for (const [rowB, colB] of cells) {
                if (rowA === rowB && colA === colB) continue;
                const colorA = grid[rowA][colA];
                const colorB = grid[rowB][colB];
                if (colorA === colorB || colorB === target[rowA][colA] || colorA === target[rowB][colB]) continue;
                const penalty = sameNeighborCount(grid, rowA, colA, colorB) + sameNeighborCount(grid, rowB, colB, colorA);
                if (penalty < bestPenalty) {
                    bestPenalty = penalty;
                    swapCell = [rowB, colB];
                }
            }
            if (swapCell) {
                const [rowB, colB] = swapCell;
                [grid[rowA][colA], grid[rowB][colB]] = [grid[rowB][colB], grid[rowA][colA]];
            }
        }
    }

    function sameNeighborCount(grid, row, col, color) {
        let count = 0;
        for (const [dr, dc] of DIRS4) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nc >= 0 && nr < grid.length && nc < grid[0].length && grid[nr][nc] === color) count += 1;
        }
        return count;
    }

    function metrics(target, grid) {
        const cells = activeCells(target);
        const inventory = colorInventory(target);
        const swapPartners = buildSwapPartners(inventory);
        let outlineMatches = 0;
        let outlineCells = 0;
        let partnerPlacements = 0;
        let displaced = 0;
        let edges = 0;
        let sameEdges = 0;
        let singletons = 0;
        const visited = new Set();
        const components = new Map();
        const largest = new Map();
        for (let row = 0; row < target.length; row += 1) {
            for (let col = 0; col < target[row].length; col += 1) {
                outlineCells += 1;
                if ((target[row][col] > 0) === (grid[row]?.[col] > 0)) outlineMatches += 1;
            }
        }
        cells.forEach(([row, col]) => {
            if (target[row][col] !== grid[row][col]) displaced += 1;
            if (swapPartners.get(grid[row][col]) === target[row][col]) partnerPlacements += 1;
            if (col + 1 < grid[0].length && target[row][col + 1] > 0) {
                edges += 1;
                if (grid[row][col] === grid[row][col + 1]) sameEdges += 1;
            }
            if (row + 1 < grid.length && target[row + 1][col] > 0) {
                edges += 1;
                if (grid[row][col] === grid[row + 1][col]) sameEdges += 1;
            }
            if (sameNeighborCount(grid, row, col, grid[row][col]) === 0) singletons += 1;
            const key = row + ',' + col;
            if (visited.has(key)) return;
            const color = grid[row][col];
            const queue = [[row, col]];
            visited.add(key);
            let size = 0;
            while (queue.length) {
                const [cr, cc] = queue.pop();
                size += 1;
                for (const [dr, dc] of DIRS4) {
                    const nr = cr + dr;
                    const nc = cc + dc;
                    const nextKey = nr + ',' + nc;
                    if (nr < 0 || nc < 0 || nr >= grid.length || nc >= grid[0].length || visited.has(nextKey)) continue;
                    if (target[nr][nc] <= 0 || grid[nr][nc] !== color) continue;
                    visited.add(nextKey);
                    queue.push([nr, nc]);
                }
            }
            components.set(color, (components.get(color) || 0) + 1);
            largest.set(color, Math.max(largest.get(color) || 0, size));
        });
        const colorCount = colorInventory(target).size || 1;
        return {
            displacement: cells.length ? displaced / cells.length : 0,
            outlineRetention: outlineCells ? outlineMatches / outlineCells : 1,
            similarCountSwapRatio: cells.length ? partnerPlacements / cells.length : 0,
            sameNeighborRatio: edges ? sameEdges / edges : 0,
            singletonRatio: cells.length ? singletons / cells.length : 0,
            componentsPerColor: [...components.values()].reduce((sum, value) => sum + value, 0) / colorCount,
            largestCluster: Math.max(0, ...largest.values()),
        };
    }

    return {
        generate,
        generateInterleaved,
        learnProfile,
        metrics,
        colorInventory,
        assertOutline,
        buildSwapPartners,
        matchingCellCount,
        minimumMatchCount,
        fragmentScore,
    };
});
