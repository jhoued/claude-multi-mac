// Prints one JSON line whenever the frontmost app's front window changes: {"pid":..,"x":..,"y":..,"w":..,"h":..} or {}.
// Uses only window bounds and owner pid, which macOS gives without the Screen Recording permission.
import AppKit

setbuf(stdout, nil)
var last = ""
while true {
    RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    if getppid() == 1 { exit(0) }  // parent app is gone
    var out = "{}"
    if let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier,
       let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]],
       // Mission Control / Exposé: WindowManager puts full-screen layers up and windows show as moved thumbnails
       !list.contains(where: { ($0[kCGWindowOwnerName as String] as? String) == "WindowManager" && (($0[kCGWindowLayer as String] as? Int) ?? 0) >= 14 }) {
        for w in list where (w[kCGWindowOwnerPID as String] as? Int32) == pid && (w[kCGWindowLayer as String] as? Int) == 0 {
            guard let b = w[kCGWindowBounds as String] as? [String: CGFloat],
                  let x = b["X"], let y = b["Y"], let wd = b["Width"], let h = b["Height"], wd > 200, h > 150 else { continue }
            out = "{\"pid\":\(pid),\"x\":\(Int(x)),\"y\":\(Int(y)),\"w\":\(Int(wd)),\"h\":\(Int(h))}"
            break
        }
    }
    if out != last { print(out); last = out }
}
