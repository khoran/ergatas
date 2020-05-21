package org.ergatas.app

import net.liftweb.util.Helpers._
import net.liftweb.util.Props

import net.liftweb.common._
import net.liftweb.http.rest.RestHelper
import net.liftweb.db.DB
import net.liftweb.http._

import net.liftweb.json.JsonAST._
import net.liftweb.json.JsonDSL._

import net.globalrecordings.grn_utils.LiftUtils._
import net.globalrecordings.grn_utils.JsonUtils._
import net.globalrecordings.grn_utils.GrDatabaseUtils._
import net.globalrecordings.grn_utils.LiftUtils.Connections.useConnection

import org.ergatas.database.web._

import com.mysema.query.scala.Helpers._
import com.mysema.query.sql._
import com.mysema.query.scala.sql._
import com.mysema.query.types.Path
import com.mysema.query.types.template.BooleanTemplate

case class Profile(organization: String, url: String, description: String, skills: String, location: String)

object Feeds extends Loggable with RestHelper {

  serve {

    case "api" :: "search" :: query :: Nil Get req => {

      toJsonResponse {
        handleOperationError() {
          transactionBox {
            querySingle(QMissionaryProfiles)((q, t) =>
              q from t where (
                (t.description containsIgnoreCase query)) select (t))
          }

          //Full(dummySearchData())

        }
      }
    }
    case "api" :: "search" :: Nil JsonPost ((jsonData, req)) => {
      toJsonResponse {
        handleOperationError() {
          Full(1)
        }
      }
    }
    //    case "api" :: "createUser" :: Nil JsonPost ((jsonData, req)) => {
    //
    //      toJsonResponse {
    //        handleOperationError() {
    //          transactionBox {
    //            for (
    //              user <- populate[Users](jsonData)
    //            ) yield {
    //
    //            }
    //          }
    //        }
    //      }
    //    }
    //
  }
  def dummySearchData() = {
    List(
      Profile("acme mission", "url1", "cool stuff", "skill1,skill2", "Temecula"),
      Profile("lsdjf mission", "url2", "scala stuff", "skill4,skill2,skill 3", "Wildomar"))
  }

}