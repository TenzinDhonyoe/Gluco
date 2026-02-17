import ExpoModulesCore
import UIKit

public class TabBarInsetsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TabBarInsets")

    AsyncFunction("setRightInset") { (rightInset: Double) -> Bool in
      guard let tabBarController = Self.findTabBarController() else {
        return false
      }
      tabBarController.additionalSafeAreaInsets = UIEdgeInsets(
        top: 0, left: 0, bottom: 0, right: CGFloat(rightInset)
      )
      return true
    }
    .runOnQueue(.main)
  }

  /// Walk the view-controller hierarchy from the key window's root
  /// and return the first UITabBarController found.
  private static func findTabBarController() -> UITabBarController? {
    guard let rootVC = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .flatMap({ $0.windows })
      .first(where: { $0.isKeyWindow })?
      .rootViewController
    else { return nil }

    return findTabBarControllerIn(rootVC)
  }

  private static func findTabBarControllerIn(_ vc: UIViewController) -> UITabBarController? {
    if let tbc = vc as? UITabBarController {
      return tbc
    }
    for child in vc.children {
      if let found = findTabBarControllerIn(child) {
        return found
      }
    }
    if let presented = vc.presentedViewController {
      return findTabBarControllerIn(presented)
    }
    return nil
  }
}
