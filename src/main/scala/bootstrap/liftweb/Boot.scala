package bootstrap.liftweb

import net.liftweb.common._
import net.liftweb.util
import net.liftweb.http._
import net.liftweb.sitemap._
import net.liftweb.sitemap.Loc._
import net.liftweb.http.ContentSourceRestriction._
import util.Helpers._
import util.{ Props, DefaultConnectionIdentifier }
import net.liftweb.http.auth.{ AuthRole, HttpBasicAuthentication, userRoles }
import net.liftweb.ldap.LDAPVendor

import net.globalrecordings.grn_utils.db_user.User
import net.globalrecordings.grn_utils.Measurable
import net.globalrecordings.grn_utils.RemoteLogging
import org.ergatas.app.Feeds

import net.liftweb.db._
import java.sql.Connection

/**
 * A class that's instantiated early and run.  It allows the application
 * to modify lift's environment
 */
class Boot extends Loggable with Measurable {
  def boot {
    LiftRules.enableLiftGC = false

    //setup static DB connection first thing so other static functions can use it
    object DBVender extends StandardDBVendor(
      Props.get("db.class", "org.postgresql.Driver"),
      Props.get("db.url", ""),
      Props.get("db.username"),
      Props.get("db.password")) {
      override def testConnection(conn: Connection) = {
        logger.debug("testing lift connection")
        DB.exec(conn.prepareStatement("SELECT 1"))(_.next())
      }

    }

    LiftRules.securityRules = () => SecurityRules(
      content = Some(ContentSecurityPolicy(
        defaultSources = List(All, UnsafeEval, UnsafeInline, Scheme("data"), Scheme("blob")),
        imageSources = List(All, UnsafeEval, UnsafeInline, Scheme("data"), Scheme("blob")),
        scriptSources = List(All, UnsafeEval, UnsafeInline, Scheme("blob")))),
      enforceInDevMode = false)
    //enforceInDevMode = true)

    DB.defineConnectionManager(DefaultConnectionIdentifier, DBVender)
    LiftRules.unloadHooks.append(() => DBVender.closeAllConnections_!())

    LiftRules.ajaxRetryCount = Some(0)
    LiftRules.ajaxPostTimeout = 90001

    // where to search snippet
    LiftRules.addToPackages("org.ergatas.app")

    LiftRules.dispatch.append(RemoteLogging)
    LiftRules.dispatch.append(Feeds)

    //write uploads straight to disk, don't keep in memory                                                               
    LiftRules.handleMimeFile = OnDiskFileParamHolder.apply

    //allow uploading large files, up to 10GB                                                                            
    LiftRules.maxMimeFileSize = 10L * 1024 * 1024 * 1024
    LiftRules.maxMimeSize = 10L * 1024 * 1024 * 1024

    // Use HTML5 for rendering
    LiftRules.htmlProperties.default.set((r: Req) =>
      new Html5Properties(r.userAgent))

    // see if user is a member of a group from LDAP
    def hasRole(role: String) =
      If(() => User.loggedIn_? && User.hasDBRole(role), User.loginFirst.failMsg)

    def devOnly =
      If(() => Props.devMode, "disabled")

    val menus = List(
      Menu("Home") / "index",
      Menu("other") / * >> Hidden >>
        EarlyResponse(() => Full(RedirectResponse("/"))))

    LiftRules.setSiteMap(SiteMap((menus ::: User.sitemap): _*))

    LiftSession.onAboutToShutdownSession =
      ((x: LiftSession) => {
        val username = User.connId.get.map(_.jndiName).getOrElse("unknown")
        logger.info("shutting down session for user "+username)
        if (username != "unknown")
          metrics.counter(s"logged_in_state.$username").dec

        User.staticConnection.get.map(c => {
          logger.debug("found static connection, closing: "+c)
          c.close()
        })
        User.connManager.map(cm => {
          logger.debug("found connManager, closing all connections")
          cm.closeAllConnections_!()
        })
        ()
      }) :: LiftSession.onAboutToShutdownSession

    LiftRules.enableLiftGC = false
  }
}

