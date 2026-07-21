import {
  PrintDocument,
  PrintNode,
  PrintTextFormat
} from '@/types/print-document'
import { KitchenTicketData, KitchenTicketItemData } from '@/types/printer'
import { sanitizeForPrint } from '../utils/sanitizeText'

/**
 * Build format that scales down magnification to fit content on one line.
 * Priority: doubleWidth+doubleHeight → doubleHeight only → normal bold.
 */
function scaledFormat (
  text: string,
  lineWidth: number,
  desired: { doubleWidth?: boolean; doubleHeight?: boolean }
): PrintTextFormat {
  if (desired.doubleWidth && text.length <= Math.floor(lineWidth / 2)) {
    return { bold: true, doubleHeight: desired.doubleHeight, doubleWidth: true }
  }
  if (desired.doubleHeight && text.length <= lineWidth) {
    return { bold: true, doubleHeight: true }
  }
  return { bold: true }
}

/**
 * Builds a PrintDocument for a kitchen ticket.
 * Layout matches the kitchen ticket mockup with conditional flags from templateConfig.
 */
export function buildKitchenTicketDocument (
  data: KitchenTicketData
): PrintDocument {
  const w = data.maxCharsPerLine
  const nodes: PrintNode[] = []
  const cfg = data.templateConfig

  // ── Void header (if applicable) ──
  if (data.isVoidTicket) {
    nodes.push({
      type: 'text_line',
      content: '** VOID **',
      align: 'center',
      format: scaledFormat('** VOID **', w, {
        doubleWidth: true,
        doubleHeight: true
      })
    })
    nodes.push({ type: 'divider', style: 'double', lineWidth: w })
  }

  // ── Refund header (if applicable) ──
  if (data.isRefundTicket) {
    nodes.push({
      type: 'text_line',
      content: '** REFUND **',
      align: 'center',
      format: scaledFormat('** REFUND **', w, {
        doubleWidth: true,
        doubleHeight: true
      })
    })
    nodes.push({ type: 'divider', style: 'double', lineWidth: w })
  }

  // ── Order Header ──
  const orderHeaderText = `ORDER ${data.orderNumber}`
  nodes.push({
    type: 'text_line',
    content: orderHeaderText,
    align: 'center',
    format: { bold: true, doubleWidth: true, doubleHeight: true }
  })

  // Order type and table on separate rows
  if (cfg?.showOrderType !== false) {
    const typeText = sanitizeForPrint(data.orderType).toUpperCase()
    nodes.push({
      type: 'text_line',
      content: typeText,
      align: 'center',
      format: scaledFormat(typeText, w, { doubleHeight: true })
    })
    if (data.tableName) {
      const tableText = `TABLE: ${sanitizeForPrint(data.tableName)}`
      nodes.push({
        type: 'text_line',
        content: tableText,
        align: 'center',
        format: scaledFormat(tableText, w, { doubleHeight: true })
      })
    }
  }

  // Server name
  if (cfg?.showServerName !== false && data.serverName) {
    nodes.push({
      type: 'text_line',
      content: `Server: ${sanitizeForPrint(data.serverName)}`,
      align: 'center',
      format: { bold: true }
    })
  }

  // Full timestamp (date + time)
  nodes.push({
    type: 'text_line',
    content: data.fullTimestamp ?? data.timestamp,
    align: 'center',
    format: { bold: true }
  })

  // Ready-by time
  if (cfg?.showReadyByTime !== false && data.readyByTime) {
    nodes.push({
      type: 'text_line',
      content: `Ready by: ${sanitizeForPrint(data.readyByTime)}`,
      align: 'center',
      format: { bold: true }
    })
  }

  nodes.push({ type: 'divider', style: 'double', lineWidth: w })

  // ── Items ──
  // Wrap existing seat/station/flat rendering with course grouping when the
  // ticket spans multiple courses (or contains any non-default course).
  pushItemsGroupedByCourse(nodes, data.items, w, cfg)

  nodes.push({ type: 'divider', style: 'double', lineWidth: w })

  // ── Item count footer ──
  if (data.totalItemCount !== undefined) {
    nodes.push({
      type: 'text_line',
      content: `${data.totalItemCount} items total`,
      align: 'center',
      format: { bold: true }
    })
  }

  nodes.push({ type: 'cut' })

  return { nodes, maxCharsPerLine: w }
}

/**
 * Top-level course grouping. Prints a prominent "COURSE N" header above each
 * course's items, then delegates to the existing seat/station/flat layout.
 * If the ticket only contains the default course (1) and no other course
 * numbers, the header is skipped to keep single-course tickets clean.
 */
function pushItemsGroupedByCourse (
  nodes: PrintNode[],
  items: KitchenTicketItemData[],
  w: number,
  cfg: KitchenTicketData['templateConfig']
): void {
  const groups = new Map<number, KitchenTicketItemData[]>()
  for (const item of items) {
    const course = item.courseNumber ?? 1
    if (!groups.has(course)) {
      groups.set(course, [])
    }
    groups.get(course)!.push(item)
  }

  // Show course headers only when the ticket spans multiple courses or
  // contains a non-default course (course > 1).
  const courseNumbers = [...groups.keys()].sort((a, b) => a - b)
  const showCourseHeaders =
    courseNumbers.length > 1 || courseNumbers.some(n => n > 1)

  let isFirst = true
  for (const course of courseNumbers) {
    const courseItems = groups.get(course)!

    if (showCourseHeaders) {
      if (!isFirst) {
        nodes.push({ type: 'empty_line' })
      }
      const headerText = `COURSE ${course}`
      nodes.push({
        type: 'text_line',
        content: headerText,
        align: 'center',
        format: scaledFormat(headerText, w, {
          doubleWidth: true,
          doubleHeight: true
        })
      })
      nodes.push({ type: 'divider', style: 'double', lineWidth: w })
    }
    isFirst = false

    if (cfg?.groupBySeat) {
      pushItemsGroupedBySeat(nodes, courseItems, w, cfg)
    } else if (cfg?.groupByStation) {
      pushItemsGroupedByStation(nodes, courseItems, w, cfg)
    } else {
      pushItemsFlat(nodes, courseItems, w, cfg)
    }
  }
}

function pushItemsGroupedByStation (
  nodes: PrintNode[],
  items: KitchenTicketItemData[],
  w: number,
  cfg: KitchenTicketData['templateConfig']
): void {
  const groups = new Map<string, KitchenTicketItemData[]>()
  for (const item of items) {
    const station = item.station || 'GENERAL'
    if (!groups.has(station)) {
      groups.set(station, [])
    }
    groups.get(station)!.push(item)
  }

  let isFirst = true
  for (const [station, stationItems] of groups) {
    if (!isFirst) {
      nodes.push({ type: 'empty_line' })
    }
    isFirst = false

    for (const item of stationItems) {
      pushSingleItem(nodes, item, w, cfg)
    }
  }
}

function pushItemsGroupedBySeat (
  nodes: PrintNode[],
  items: KitchenTicketItemData[],
  w: number,
  cfg: KitchenTicketData['templateConfig']
): void {
  const groups = new Map<string, KitchenTicketItemData[]>()
  for (const item of items) {
    const seat = item.seatNumber != null ? `SEAT ${item.seatNumber}` : 'SHARED'
    if (!groups.has(seat)) {
      groups.set(seat, [])
    }
    groups.get(seat)!.push(item)
  }

  let isFirst = true
  for (const [seat, seatItems] of groups) {
    if (!isFirst) {
      nodes.push({ type: 'empty_line' })
    }
    isFirst = false

    nodes.push({
      type: 'text_line',
      content: `-- ${seat} --`,
      align: 'center',
      format: { bold: true }
    })
    nodes.push({ type: 'divider', style: 'solid', lineWidth: w })

    for (const item of seatItems) {
      pushSingleItem(nodes, item, w, cfg)
    }
  }
}

function pushItemsFlat (
  nodes: PrintNode[],
  items: KitchenTicketItemData[],
  w: number,
  cfg: KitchenTicketData['templateConfig']
): void {
  for (const item of items) {
    pushSingleItem(nodes, item, w, cfg)
  }
}

function pushSingleItem (
  nodes: PrintNode[],
  item: KitchenTicketItemData,
  w: number,
  cfg: KitchenTicketData['templateConfig']
): void {
  const useLargeText = cfg?.largeItemText !== false
  const prefix = item.isVoided ? 'VOID ' : item.isRefunded ? 'REFUND ' : ''
  const qtyStr = `${item.quantity}x `
  const itemText = `${prefix}${qtyStr}${sanitizeForPrint(item.name)}`

  nodes.push({
    type: 'text_line',
    content: itemText,
    format: scaledFormat(itemText, w, { doubleHeight: useLargeText })
  })

  // Modifiers (conditional)
  if (cfg?.showItemModifiers !== false) {
    const modStyle = cfg?.modifierStyle ?? 'inverted'
    let modFormat: PrintTextFormat
    switch (modStyle) {
      case 'red':
        modFormat = { bold: true, secondColor: true }
        break
      case 'bold':
        modFormat = { bold: true }
        break
      case 'inverted':
      default:
        modFormat = { bold: true, inverted: true }
        break
    }

    if (cfg?.showModsLarge) {
      modFormat = { ...modFormat, doubleHeight: true }
    }

    for (const mod of item.modifiers) {
      const sanitizedMod = sanitizeForPrint(mod)
      const isNo = sanitizedMod.startsWith('NO ')
      if (modStyle === 'inverted') {
        // Reduced indent for inverted — avoids full-line black bar on leading whitespace
        nodes.push({
          type: 'text_line',
          content: ` ${isNo ? '-' : '+'} ${sanitizedMod}`,
          format: modFormat
        })
      } else {
        nodes.push({
          type: 'text_line',
          content: `  ${isNo ? '-' : '+'} ${sanitizedMod}`,
          format: modFormat
        })
      }
    }
  }

  // Allergy alert (prominent warning)
  if (cfg?.showAllergyAlert !== false && item.allergyAlert) {
    nodes.push({
      type: 'text_line',
      content: `  !! ALLERGY: ${sanitizeForPrint(item.allergyAlert)} !!`,
      format: { bold: true }
    })
  }

  // Special instructions (prominent)
  if (item.notes) {
    nodes.push({
      type: 'text_line',
      content: `  *** ${sanitizeForPrint(item.notes)} ***`,
      format: { bold: true }
    })
  }

  nodes.push({ type: 'empty_line' })
}
